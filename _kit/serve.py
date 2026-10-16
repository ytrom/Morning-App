# Morning App server (Python standard library + pg8000 for Postgres).
# Serves the pages and the /api/ calls the app makes. Runs on the NAS in Docker; through the Cloudflare tunnel
# every request must carry a valid Cloudflare Access login, at home (or on this PC) no login is needed.
import base64, hashlib, hmac, http.cookies, http.server, json, os, posixpath, sys, time, traceback, urllib.parse, urllib.request
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ---- Cloudflare Access check (same as Our Second Dance) -------------------------------------------
# The Zero Trust team name(s) and the app's "Application Audience (AUD) Tag" come from ACCESS_TEAM / ACCESS_AUD
# or _kit/access.json: {"teams": ["..."], "aud": "..."} (neither is secret). The file is re-read every 30 seconds.
_acc = {"at": 0, "teams": [], "aud": ""}
_certs = {}


def access_settings():
    if time.time() - _acc["at"] > 30:
        try:
            j = json.load(open(os.path.join(ROOT, "_kit", "access.json"), encoding="utf-8"))
        except Exception:
            j = {}
        teams = [t.strip() for t in (j.get("teams") or [j.get("team", "")]) if t and t.strip()]
        if not teams:
            teams = [t.strip() for t in os.environ.get("ACCESS_TEAM", "").split(",") if t.strip()]
        _acc.update(at=time.time(), teams=list(dict.fromkeys(teams)), aud=(j.get("aud") or os.environ.get("ACCESS_AUD", "")).strip())
    return _acc["teams"], _acc["aud"]


def _b64url(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _access_keys(team, fresh=False):
    c = _certs.get(team)
    if fresh or not c or time.time() - c["at"] > 3600:
        url = f"https://{team}.cloudflareaccess.com/cdn-cgi/access/certs"
        with urllib.request.urlopen(url, timeout=10) as r:
            keys = json.load(r).get("keys", [])
        c = _certs[team] = {"at": time.time(), "keys": {k["kid"]: (int.from_bytes(_b64url(k["n"]), "big"), int.from_bytes(_b64url(k["e"]), "big"))
                                                        for k in keys if k.get("kty") == "RSA"}}
    return c["keys"]


def access_log(msg):
    # Why a login check failed (never the token itself): _kit/access-check.log
    try:
        p = os.path.join(ROOT, "_kit", "access-check.log")
        lines = open(p, encoding="utf-8").read().splitlines()[-49:] if os.path.exists(p) else []
        lines.append(time.strftime("%Y-%m-%d %H:%M:%S ") + msg)
        open(p, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    except Exception:
        pass


def access_email(token):
    """Return the signed-in email if the Cloudflare Access token is valid, else None (RS256, checked by hand)."""
    teams, aud = access_settings()
    if not (teams and aud and token):
        access_log(f"missing: team={bool(teams)} aud={bool(aud)} token={bool(token)}")
        return None
    try:
        return _check_access(token, teams, aud)
    except Exception as e:
        access_log(f"error: {type(e).__name__}: {e}")
        return None


def _check_access(token, teams, want_aud):
    head_b, body_b, sig_b = token.split(".")
    head, body = json.loads(_b64url(head_b)), json.loads(_b64url(body_b))
    if head.get("alg") != "RS256":
        return access_log(f"alg {head.get('alg')}")
    team = next((t for t in teams if body.get("iss") == f"https://{t}.cloudflareaccess.com"), None)
    if not team:
        return access_log(f"iss mismatch: {body.get('iss')}")
    key = None
    for t in [team] + [x for x in teams if x != team]:
        try:
            key = _access_keys(t).get(head.get("kid")) or _access_keys(t, fresh=True).get(head.get("kid"))
        except Exception:
            key = None
        if key:
            break
    if not key:
        return access_log(f"unknown kid {str(head.get('kid'))[:8]} for {team}")
    n, e = key
    k = (n.bit_length() + 7) // 8
    em = pow(int.from_bytes(_b64url(sig_b), "big"), e, n).to_bytes(k, "big")
    t = bytes.fromhex("3031300d060960864801650304020105000420") + hashlib.sha256(f"{head_b}.{body_b}".encode()).digest()
    if not hmac.compare_digest(em, b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t):
        return access_log("signature mismatch")
    aud = body.get("aud")
    if want_aud not in (aud if isinstance(aud, list) else [aud]):
        return access_log(f"aud mismatch: token {str(aud)[:20]}")
    if body.get("exp", 0) < time.time():
        return access_log("expired")
    return body.get("email") or body.get("sub") or "unknown"


# ---- the API ---------------------------------------------------------------------------------------

def today():
    return datetime.date.today()  # the container's TZ setting decides what "today" is


def api_get(path, qs):
    arg = lambda k, d="": (qs.get(k) or [d])[0]
    if path == "/api/day":
        return db.get_day(db.parse_date(arg("date", today().isoformat())))
    if path == "/api/tasks":
        return {"tasks": db.list_tasks(arg("q")), "mc": db.mc_status()}
    if path == "/api/settings":
        return db.settings()
    if path == "/api/stats":
        return db.stats(arg("days", "30"))
    return None


def api_post(path, b):
    date = lambda: db.parse_date(b.get("date") or today().isoformat())
    routes = {
        "/api/routine/toggle": lambda: db.toggle_routine(date(), b["item_id"], bool(b.get("done"))),
        "/api/journal": lambda: db.add_journal(date(), b.get("kind"), b.get("text")),
        "/api/journal/delete": lambda: db.delete_journal(b["id"]),
        "/api/tasks": lambda: db.create_task(b.get("title"), b.get("project"), b.get("due_date")),
        "/api/day/pick": lambda: db.pick_task(date(), b.get("slot"), b.get("task_id"), b.get("carried_from_id"), b.get("title")),
        "/api/day/move": lambda: db.move_task(b["id"], b.get("slot")),
        "/api/day/unpick": lambda: db.unpick(b["id"]),
        "/api/day/tomorrow": lambda: db.carry_to_tomorrow(b["id"]),
        "/api/day/task": lambda: db.update_day_task(b["id"], b),
        "/api/day/confirm": lambda: db.set_plan_flag(date(), "confirmed"),
        "/api/day/printed": lambda: db.set_plan_flag(date(), "printed"),
        "/api/habit/log": lambda: db.log_habit(date(), b["habit_id"], b.get("value"), b.get("met")),
        "/api/review": lambda: db.save_review(date(), b),
        "/api/gratitude": lambda: db.save_gratitude(date(), b.get("position"), b.get("statement")),
        "/api/settings/habit": lambda: db.save_habit(b),
        "/api/settings/routine": lambda: db.save_routine_item(b),
    }
    fn = routes.get(path)
    if not fn:
        return None
    return fn() or {}


BLOCKED = ("/_kit", "/.git", "/.env", "/.")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        if os.environ.get("QUIET") != "1":
            super().log_message(fmt, *args)

    def send_json(self, obj, code=200):
        body = json.dumps(obj, default=db.jsonable).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, code, msg):
        body = msg.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def from_internet(self):
        # Requests through the Cloudflare tunnel carry Cloudflare's headers; home-network ones don't.
        return any(self.headers.get(h) for h in ("Cf-Connecting-Ip", "Cf-Ray", "X-Forwarded-For"))

    def internet_ok(self):
        # Through the tunnel, only visitors with a valid Cloudflare Access login get anything at all.
        if not self.from_internet():
            return True
        token = self.headers.get("Cf-Access-Jwt-Assertion", "")
        if not token:
            c = http.cookies.SimpleCookie()
            try:
                c.load(self.headers.get("Cookie", ""))
            except Exception:
                pass
            token = c["CF_Authorization"].value if "CF_Authorization" in c else ""
        if access_email(token):
            return True
        self.send_text(403, "Please sign in. (The Cloudflare login isn't in front of this address yet.)")
        return False

    def clean_path(self):
        return "/" + posixpath.normpath(urllib.parse.unquote(self.path.split("?")[0]).replace("\\", "/")).lstrip("/").lower()

    def run_api(self, fn):
        try:
            out = fn()
        except db.BadRequest as e:
            return self.send_json({"error": str(e)}, 400)
        except (KeyError, ValueError, TypeError) as e:
            return self.send_json({"error": f"Something was missing or wrong in that request ({type(e).__name__})."}, 400)
        except Exception as e:
            traceback.print_exc()
            if "slot_full" in str(e):
                return self.send_json({"error": "That list is full. Swap one out to add another."}, 400)
            return self.send_json({"error": "The server hit a problem saving that. Try again."}, 500)
        if out is None:
            return self.send_json({"error": "Not found"}, 404)
        self.send_json(out)

    def do_HEAD(self):
        if not self.internet_ok():
            return
        p = self.clean_path()
        if p.startswith(BLOCKED + ("/api/",)) or p.endswith((".cmd", ".py", ".yml", ".md")):
            return self.send_text(403, "Not available.")
        super().do_HEAD()

    def do_GET(self):
        if not self.internet_ok():
            return
        p = self.clean_path()
        if p.startswith(BLOCKED) or p.endswith((".cmd", ".py", ".yml", ".md")):
            return self.send_text(403, "Not available.")
        if p.startswith("/api/"):
            qs = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            return self.run_api(lambda: api_get(p, qs))
        super().do_GET()

    def do_POST(self):
        if not self.internet_ok():
            return
        p = self.clean_path()
        # Only the app's own pages can save: they send JSON, which another website can't do without asking first.
        if not (self.headers.get("Content-Type", "").startswith("application/json") and p.startswith("/api/")):
            return self.send_text(403, "Not available.")
        n = int(self.headers.get("Content-Length") or 0)
        if n > 1_000_000:
            return self.send_text(413, "Too big.")
        try:
            b = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(b, dict):
                raise ValueError
        except ValueError:
            return self.send_json({"error": "Bad request"}, 400)
        self.run_api(lambda: api_post(p, b))

    def end_headers(self):
        # Pages and scripts must never be kept by Cloudflare or the phone, or updates don't arrive.
        p = self.path.split("?")[0].lower()
        if p.endswith((".html", ".js", ".css", ".json", "/")) and not any(b"Cache-Control" in h for h in getattr(self, "_headers_buffer", [])):
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()


def main():
    for attempt in range(30):  # the database container may still be starting
        try:
            db.migrate()
            db.seed_defaults()
            break
        except Exception as e:
            print(f"Waiting for the database ({type(e).__name__}: {e})", flush=True)
            time.sleep(2)
    else:
        sys.exit("Couldn't reach the database. Check DATABASE_URL.")
    # On the PC it listens on this PC only; on the NAS (Docker) HOST=0.0.0.0 so the home network and tunnel can reach it.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8090"))
    print(f"Open http://localhost:{port}   (close this window to stop)", flush=True)
    http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()

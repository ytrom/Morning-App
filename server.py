"""Morning Workout: serves the app and saves each day's ticks to /data/ticks.json.
Set APP_PIN to require a PIN login (needed when the app is reachable from the internet).
Five wrong PINs in a row lock the login for 15 minutes.
The Work tab reads today's MITs and LITs from Mission Control on the LAN (MC_URL) through /api/mc/*,
so the phone only ever talks to this server. /api/mc/waiting is Mission Control's Waiting list: MITs
marked "Done for today, waiting on..." with a chase date.
Saving a day's Workout ticks also ticks that day's Mission Control scheduled task with "workout" in its
title (ticked once any exercise is done, unticked when all ticks are cleared)."""
import hashlib, hmac, html, json, os, re, threading, time
import urllib.error, urllib.request
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlsplit

APP_DIR = os.environ.get("APP_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "app"))
DATA_DIR = os.environ.get("DATA_DIR", "/data")
PORT = int(os.environ.get("PORT", "8080"))
PASSWORD = os.environ.get("APP_PIN", "").strip()
TOKEN = hmac.new(PASSWORD.encode(), b"morning-workout", hashlib.sha256).hexdigest() if PASSWORD else ""
DATE = re.compile(r"^/api/(ticks|routine)/(\d{4}-\d{2}-\d{2})$")
TIME = re.compile(r"^\d{2}:\d{2}$")
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MC_URL = os.environ.get("MC_URL", "http://192.168.0.253:3000").rstrip("/")
OPEN_PATHS = {"/login", "/manifest.json", "/icon.svg", "/icon-180.png", "/icon-512.png"}
lock = threading.Lock()
fails = {"count": 0, "until": 0.0}

LOGIN_PAGE = """<!doctype html><html lang="en-AU"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Morning Workout</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3f4;color:#13222b;font:16px system-ui,sans-serif;padding:0 16px}
form{background:#fff;border:1px solid #d5dfe3;border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:12px;width:100%;max-width:340px}
h1{margin:0;font-size:1.5rem}input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #d5dfe3}
button{background:#0d7480;color:#fff;border:0;font-weight:600;cursor:pointer}.err{color:#b3261e;margin:0}
@media (prefers-color-scheme:dark){body{background:#0f181d;color:#e4eef1}form{background:#172329;border-color:#2a3a42}input{background:#0f181d;color:#e4eef1;border-color:#2a3a42}}</style>
</head><body><form method="post" action="login"><h1>Morning Workout</h1>%s
<label for="pw">PIN</label><input id="pw" name="password" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" autofocus required>
<button type="submit">Open my workout</button></form></body></html>"""


def mc(method, path, body=None):
    """Calls Mission Control; returns (status, parsed JSON)."""
    req = urllib.request.Request(MC_URL + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"} if body is not None else {})
    try:
        with urllib.request.urlopen(req, timeout=6) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {"error": "Mission Control error %d" % e.code}
    except (urllib.error.URLError, OSError, ValueError):
        return 502, {"error": "Couldn't reach Mission Control"}


def clean_steps(steps, keep_done=True):
    """Only text, minutes and (optionally) done go through to Mission Control."""
    if not isinstance(steps, list):
        return []
    out = []
    for x in steps[:30]:
        if isinstance(x, dict) and str(x.get("text", "")).strip():
            st = {"text": str(x["text"]).strip()[:300], "min": max(0, min(int(x.get("min", 0) or 0), 600))}
            if keep_done:
                st["done"] = bool(x.get("done"))
            out.append(st)
    return out


def field(b, key, limit):
    return str(b.get(key) or "").strip()[:limit]


def ref(b, key):
    v = b.get(key)
    return str(v)[:80] if v else None


def sync_workout(day, done):
    """Ticks (or unticks) the day's "workout" scheduled task in Mission Control. Runs in the background."""
    def run():
        status, d = mc("GET", "/api/scheduled?" + urlencode({"from": day, "to": day}))
        if status != 200:
            return
        for s in d.get("items", []):
            if "workout" in str(s.get("title", "")).lower():
                mc("PATCH", "/api/scheduled", {"id": s["id"], "day": day, "done": done})
    threading.Thread(target=run, daemon=True).start()


def data_file(kind):
    return os.path.join(DATA_DIR, kind + ".json")


def load(kind):
    try:
        with open(data_file(kind)) as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def save(kind, data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = data_file(kind) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=1, sort_keys=True)
    os.replace(tmp, data_file(kind))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP_DIR, **kw)

    def send_body(self, code, body, ctype, extra=()):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, code, obj):
        self.send_body(code, json.dumps(obj).encode(), "application/json")

    def login_page(self, error=""):
        msg = '<p class="err">%s</p>' % html.escape(error) if error else ""
        self.send_body(401 if error else 200, (LOGIN_PAGE.replace("%s", msg, 1)).encode(), "text/html; charset=utf-8")

    def authed(self):
        if not PASSWORD:
            return True
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        return "mw" in cookie and hmac.compare_digest(cookie["mw"].value, TOKEN)

    def guard(self):
        """True when the request may go ahead; otherwise sends the login page or a 401."""
        path = self.path.split("?")[0]
        if self.authed() or path in OPEN_PATHS:
            return True
        if path.startswith("/api/"):
            self.send_json(401, {"error": "login needed"})
        else:
            self.login_page()
        return False

    def read_json(self, limit=20000):
        length = min(int(self.headers.get("Content-Length", 0)), limit)
        data = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(data, dict):
            raise ValueError
        return data

    def do_GET(self):
        if self.path.split("?")[0] == "/login":
            return self.login_page()
        if not self.guard():
            return
        url = urlsplit(self.path)
        if url.path == "/api/mc/day-plan":
            q = parse_qs(url.query)
            day = [q.get(k, [""])[0] for k in ("from", "to")]
            if not all(DAY.match(d) for d in day):
                return self.send_json(400, {"error": "from and to dates needed"})
            return self.send_json(*mc("GET", "/api/day-plan?" + urlencode({"from": day[0], "to": day[1]})))
        if url.path == "/api/mc/waiting":
            return self.send_json(*mc("GET", "/api/waiting"))
        m = DATE.match(self.path)
        if m:
            with lock:
                return self.send_json(200, load(m.group(1)).get(m.group(2), {}))
        return super().do_GET()

    def do_PATCH(self):
        # Ticking MIT steps and LITs (id, steps, done), and chasing or closing a Waiting item
        if not self.guard():
            return
        path = self.path.split("?")[0]
        if path not in ("/api/mc/day-plan", "/api/mc/waiting"):
            return self.send_json(404, {"error": "not found"})
        try:
            b = self.read_json()
            body = {"id": str(b["id"])[:80]}
            if path == "/api/mc/waiting":
                if DAY.match(str(b.get("chaseOn", ""))):
                    body["chaseOn"] = b["chaseOn"]
                for k in ("chased", "closed"):
                    if b.get(k) is True:
                        body[k] = True
                return self.send_json(*mc("PATCH", "/api/waiting", body))
            if isinstance(b.get("steps"), list):
                body["steps"] = clean_steps(b["steps"])
            if "done" in b:
                body["done"] = bool(b["done"])
        except (ValueError, KeyError, TypeError):
            return self.send_json(400, {"error": "bad data"})
        return self.send_json(*mc("PATCH", "/api/day-plan", body))

    def do_POST(self):
        if self.path.split("?")[0] in ("/api/mc/waiting", "/api/mc/day-plan"):
            # Parking an MIT on the Waiting list, or bringing one back as today's MIT or LIT
            if not self.guard():
                return
            try:
                b = self.read_json()
                if self.path.startswith("/api/mc/waiting"):
                    body = {"title": field(b, "title", 300), "waitingOn": field(b, "waitingOn", 200),
                            "chaseOn": str(b.get("chaseOn", "")), "planId": ref(b, "planId"), "taskId": ref(b, "taskId"),
                            "note": field(b, "note", 1000), "steps": clean_steps(b.get("steps"), keep_done=False)}
                    if not body["title"] or not DAY.match(body["chaseOn"]):
                        return self.send_json(400, {"error": "A title and a chase date are needed"})
                    return self.send_json(*mc("POST", "/api/waiting", body))
                body = {"day": str(b.get("day", "")), "kind": b.get("kind"), "title": field(b, "title", 300),
                        "taskId": ref(b, "taskId"), "steps": clean_steps(b.get("steps"), keep_done=False)}
                if not DAY.match(body["day"]) or body["kind"] not in ("mit", "lit") or not body["title"]:
                    return self.send_json(400, {"error": "A day, a kind and a title are needed"})
                return self.send_json(*mc("POST", "/api/day-plan", body))
            except (ValueError, TypeError):
                return self.send_json(400, {"error": "bad data"})
        if self.path.split("?")[0] == "/api/mc/inbox":
            # The + button: a note into the Mission Control Inbox
            if not self.guard():
                return
            try:
                b = self.read_json(4000)
                text, kind = str(b.get("text", "")).strip()[:500], "idea" if b.get("kind") == "idea" else "task"
            except ValueError:
                text = ""
            if not text:
                return self.send_json(400, {"error": "nothing to add"})
            return self.send_json(*mc("POST", "/api/inbox", {"text": text, "source": "phone", "kind": kind}))
        if self.path.split("?")[0] != "/login" or not PASSWORD:
            return self.send_json(404, {"error": "not found"})
        length = min(int(self.headers.get("Content-Length", 0)), 2000)
        given = parse_qs(self.rfile.read(length).decode(errors="ignore")).get("password", [""])[0]
        with lock:
            if time.time() < fails["until"]:
                return self.login_page("Too many wrong tries. Wait 15 minutes, then try again.")
            if not hmac.compare_digest(given.strip().encode(), PASSWORD.encode()):
                fails["count"] += 1
                if fails["count"] >= 5:
                    fails["count"], fails["until"] = 0, time.time() + 900
                return self.login_page("That PIN didn't match. Try again.")
            fails["count"] = 0
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "") == "https" else ""
        cookie = "mw=%s; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax%s" % (TOKEN, secure)
        self.send_body(303, b"", "text/plain", [("Location", "./"), ("Set-Cookie", cookie)])

    def do_PUT(self):
        if not self.guard():
            return
        m = DATE.match(self.path)
        if not m:
            return self.send_json(404, {"error": "not found"})
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 10000)
            ticks = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(ticks, dict):
                raise ValueError
            # Ticks are true/false; habit entries may also be a time like "06:45".
            # Habits may also hold a number, like steps or litres of water.
            ticks = {str(k)[:40]: (v if isinstance(v, str) and TIME.match(v)
                                   else v if isinstance(v, (int, float)) and not isinstance(v, bool) and 0 < v < 1e6
                                   else True)
                     for k, v in ticks.items() if v}
        except ValueError:
            return self.send_json(400, {"error": "bad data"})
        with lock:
            data = load(m.group(1))
            data[m.group(2)] = ticks
            save(m.group(1), data)
        if m.group(1) == "ticks":
            sync_workout(m.group(2), bool(ticks))
        return self.send_json(200, ticks)


if __name__ == "__main__":
    print(f"Morning Workout on port {PORT}, saving to {DATA_DIR}, login {'on' if PASSWORD else 'off'}")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()

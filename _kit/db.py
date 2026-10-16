# Morning App: the Postgres tables and every read and write the server makes.
# Uses pg8000 (pure Python, no compiler needed), installed in the Docker image by _kit/nas/Dockerfile.
# The connection comes from DATABASE_URL, e.g. postgres://morning:secret@db:5432/morning
import datetime, decimal, json, os, threading, time, urllib.parse, urllib.request

import pg8000.native

MIT_MAX, LIT_MAX = 3, 10
SLOTS = ("MIT", "LIT", "ALSO")
TASK_STATUS = ("open", "done", "partly", "not_done")

SCHEMA = """
CREATE TABLE IF NOT EXISTS day_plan (
  id            serial PRIMARY KEY,
  plan_date     date NOT NULL UNIQUE,
  confirmed_at  timestamptz,
  printed_at    timestamptz,
  energy        smallint CHECK (energy BETWEEN 1 AND 5),
  focus         smallint CHECK (focus BETWEEN 1 AND 5),
  mood          smallint CHECK (mood BETWEEN 1 AND 5),
  sleep         smallint CHECK (sleep BETWEEN 1 AND 5),
  review_note   text,
  reviewed_at   timestamptz
);

CREATE TABLE IF NOT EXISTS routine_item (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS routine_check (
  day_plan_id     integer NOT NULL REFERENCES day_plan(id) ON DELETE CASCADE,
  routine_item_id integer NOT NULL REFERENCES routine_item(id),
  done_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_plan_id, routine_item_id)
);

CREATE TABLE IF NOT EXISTS journal_entry (
  id          serial PRIMARY KEY,
  day_plan_id integer NOT NULL REFERENCES day_plan(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'morning' CHECK (kind IN ('morning', 'evening')),
  transcript  text NOT NULL,
  audio_path  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Stand-in task list until Mission Control is connected; mc_task_id links a task to Mission Control later.
CREATE TABLE IF NOT EXISTS task (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  project     text,
  due_date    date,
  mc_task_id  text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);

CREATE TABLE IF NOT EXISTS day_task (
  id              serial PRIMARY KEY,
  day_plan_id     integer NOT NULL REFERENCES day_plan(id) ON DELETE CASCADE,
  slot            text NOT NULL CHECK (slot IN ('MIT', 'LIT', 'ALSO')),
  position        integer NOT NULL DEFAULT 0,
  task_id         integer REFERENCES task(id),
  title_snapshot  text NOT NULL,
  output_goal     text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'partly', 'not_done')),
  carried_from_id integer REFERENCES day_task(id) ON DELETE SET NULL,
  UNIQUE (day_plan_id, task_id)
);

CREATE TABLE IF NOT EXISTS mit_step (
  id          serial PRIMARY KEY,
  day_task_id integer NOT NULL REFERENCES day_task(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  text        text NOT NULL,
  done        boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS time_block (
  day_task_id       integer PRIMARY KEY REFERENCES day_task(id) ON DELETE CASCADE,
  starts_at         time NOT NULL,
  ends_at           time NOT NULL CHECK (ends_at > starts_at),
  calendar_event_id text,
  provider          text
);

CREATE TABLE IF NOT EXISTS habit (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  kind         text NOT NULL DEFAULT 'yes_no' CHECK (kind IN ('yes_no', 'number')),
  target       numeric,
  unit         text,
  days_of_week text NOT NULL DEFAULT '1234567',  -- ISO weekdays it applies to: 1 = Monday
  sort_order   integer NOT NULL DEFAULT 0,
  archived_at  timestamptz
);

CREATE TABLE IF NOT EXISTS habit_log (
  day_plan_id integer NOT NULL REFERENCES day_plan(id) ON DELETE CASCADE,
  habit_id    integer NOT NULL REFERENCES habit(id),
  value       numeric,
  met         boolean NOT NULL,
  source      text NOT NULL DEFAULT 'manual',
  logged_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_plan_id, habit_id)
);

CREATE TABLE IF NOT EXISTS gratitude (
  day_plan_id       integer NOT NULL REFERENCES day_plan(id) ON DELETE CASCADE,
  position          smallint NOT NULL CHECK (position BETWEEN 1 AND 4),
  statement         text,
  drive_item_id     text,
  taken_at          timestamptz,
  cached_image_path text,
  PRIMARY KEY (day_plan_id, position)
);

-- 3 MITs and 10 LITs per day, enforced here too so no other tool can break the rule.
CREATE OR REPLACE FUNCTION day_task_limit() RETURNS trigger AS $$
DECLARE n integer; cap integer;
BEGIN
  cap := CASE NEW.slot WHEN 'MIT' THEN 3 WHEN 'LIT' THEN 10 ELSE NULL END;
  IF cap IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM day_task
   WHERE day_plan_id = NEW.day_plan_id AND slot = NEW.slot AND id IS DISTINCT FROM NEW.id;
  IF n >= cap THEN
    RAISE EXCEPTION 'slot_full: % already has % tasks', NEW.slot, cap;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS day_task_limit ON day_task;
CREATE TRIGGER day_task_limit BEFORE INSERT OR UPDATE OF slot, day_plan_id ON day_task
  FOR EACH ROW EXECUTE FUNCTION day_task_limit();

-- One row per day for reporting (point Power BI, Metabase or Excel here).
CREATE OR REPLACE VIEW v_daily_summary AS
SELECT d.plan_date,
       (SELECT count(*) FROM day_task t WHERE t.day_plan_id = d.id AND t.slot = 'MIT') AS mits_planned,
       (SELECT count(*) FROM day_task t WHERE t.day_plan_id = d.id AND t.slot = 'MIT' AND t.status = 'done') AS mits_done,
       (SELECT count(*) FROM day_task t WHERE t.day_plan_id = d.id AND t.slot = 'MIT' AND t.status = 'partly') AS mits_partly,
       (SELECT count(*) FROM day_task t WHERE t.day_plan_id = d.id AND t.slot = 'LIT') AS lits_planned,
       (SELECT count(*) FROM day_task t WHERE t.day_plan_id = d.id AND t.slot = 'LIT' AND t.status = 'done') AS lits_done,
       (SELECT count(*) FROM habit_log h WHERE h.day_plan_id = d.id) AS habits_logged,
       (SELECT count(*) FROM habit_log h WHERE h.day_plan_id = d.id AND h.met) AS habits_kept,
       d.energy, d.focus, d.mood, d.sleep,
       d.reviewed_at IS NOT NULL AS reviewed
  FROM day_plan d;
"""


class BadRequest(Exception):
    """A request the user can fix; the message is shown to them."""


def _connect():
    url = os.environ.get("DATABASE_URL", "postgres://morning:morning@localhost:5432/morning")
    u = urllib.parse.urlparse(url)
    return pg8000.native.Connection(
        user=urllib.parse.unquote(u.username or "morning"),
        password=urllib.parse.unquote(u.password or "") or None,
        host=u.hostname or "localhost",
        port=u.port or 5432,
        database=(u.path or "/morning").lstrip("/") or "morning",
    )


_local = threading.local()


def conn():
    # One connection per server thread, reopened if the database restarted.
    c = getattr(_local, "c", None)
    if c is not None:
        try:
            c.run("SELECT 1")
            return c
        except Exception:
            try:
                c.close()
            except Exception:
                pass
    _local.c = _connect()
    return _local.c


def q(sql, **params):
    """Run SQL with :name parameters and return a list of dicts."""
    c = conn()
    rows = c.run(sql, **params)
    if not c.columns:
        return []
    names = [col["name"] for col in c.columns]
    return [dict(zip(names, r)) for r in rows]


def one(sql, **params):
    rows = q(sql, **params)
    return rows[0] if rows else None


def tx(fn):
    """Run fn() inside one transaction."""
    c = conn()
    c.run("BEGIN")
    try:
        out = fn()
        c.run("COMMIT")
        return out
    except Exception:
        c.run("ROLLBACK")
        raise


def migrate():
    conn().run(SCHEMA)


def jsonable(v):
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    raise TypeError(type(v).__name__)


# ---- helpers ---------------------------------------------------------------------------------------

def parse_date(s):
    try:
        return datetime.date.fromisoformat(str(s))
    except Exception:
        raise BadRequest("Pick a valid date.")


def parse_time(s):
    if s in (None, ""):
        return None
    try:
        return datetime.time.fromisoformat(str(s))
    except Exception:
        raise BadRequest("Times look like 09:30.")


def text(v, limit=2000):
    v = ("" if v is None else str(v)).strip()
    return v[:limit]


def day_id(date, create=True):
    row = one("SELECT id FROM day_plan WHERE plan_date = :d", d=date)
    if row:
        return row["id"]
    if not create:
        return None
    return one("INSERT INTO day_plan (plan_date) VALUES (:d) ON CONFLICT (plan_date) DO UPDATE SET plan_date = EXCLUDED.plan_date RETURNING id", d=date)["id"]


def applies(habit, date):
    return str(date.isoweekday()) in (habit.get("days_of_week") or "1234567")


# ---- reads -----------------------------------------------------------------------------------------

def get_day(date):
    did = day_id(date, create=False)
    plan = one("SELECT * FROM day_plan WHERE id = :i", i=did) if did else None

    routine = q("""SELECT r.id, r.name, (c.day_plan_id IS NOT NULL) AS done
                     FROM routine_item r
                     LEFT JOIN routine_check c ON c.routine_item_id = r.id AND c.day_plan_id = :d
                    WHERE r.archived_at IS NULL ORDER BY r.sort_order, r.id""", d=did or 0)

    tasks = q("""SELECT t.*, b.starts_at, b.ends_at, task.project
                   FROM day_task t
                   LEFT JOIN time_block b ON b.day_task_id = t.id
                   LEFT JOIN task ON task.id = t.task_id
                  WHERE t.day_plan_id = :d ORDER BY t.slot, t.position, t.id""", d=did or 0)
    steps = q("""SELECT s.* FROM mit_step s JOIN day_task t ON t.id = s.day_task_id
                  WHERE t.day_plan_id = :d ORDER BY s.position""", d=did or 0)
    for t in tasks:
        t["steps"] = [s for s in steps if s["day_task_id"] == t["id"]]

    habits = q("""SELECT h.id, h.name, h.kind, h.target, h.unit, h.days_of_week, l.value, l.met
                    FROM habit h
                    LEFT JOIN habit_log l ON l.habit_id = h.id AND l.day_plan_id = :d
                   WHERE h.archived_at IS NULL ORDER BY h.sort_order, h.id""", d=did or 0)
    for h in habits:  # habits not set for this weekday still show, muted, in the evening review
        h["applies"] = applies(h, date)

    # Unfinished MITs and LITs from the most recent earlier day, offered first in the picker.
    prev = one("SELECT id, plan_date FROM day_plan WHERE plan_date < :d ORDER BY plan_date DESC LIMIT 1", d=date)
    carry = []
    if prev:
        carry = q("""SELECT p.id, p.slot, p.title_snapshot, p.task_id, p.status
                       FROM day_task p
                      WHERE p.day_plan_id = :p AND p.slot IN ('MIT', 'LIT') AND p.status <> 'done'
                        AND NOT EXISTS (SELECT 1 FROM day_task t WHERE t.day_plan_id = :d
                                         AND (t.carried_from_id = p.id OR (p.task_id IS NOT NULL AND t.task_id = p.task_id)))
                      ORDER BY p.slot, p.position""", p=prev["id"], d=did or 0)

    return {
        "date": date.isoformat(),
        "plan": plan,
        "routine": routine,
        "journal": q("SELECT id, kind, transcript, created_at FROM journal_entry WHERE day_plan_id = :d ORDER BY created_at", d=did or 0),
        "tasks": tasks,
        "habits": habits,
        "gratitude": q("SELECT position, statement FROM gratitude WHERE day_plan_id = :d ORDER BY position", d=did or 0),
        "carry": carry,
        "limits": {"MIT": MIT_MAX, "LIT": LIT_MAX},
    }


# Mission Control (Next.js on the office network) is the source of the task list when MC_URL is set.
# Its open tasks for Morty are copied into `task` (linked by mc_task_id) at most once a minute; tasks it
# has finished or deleted drop off the list here. Quick-adds made in this app stay local.
MC_URL = os.environ.get("MC_URL", "").rstrip("/")
_mc = {"at": 0.0, "ok": None, "error": ""}


def sync_mc(force=False):
    if not MC_URL or (not force and time.time() - _mc["at"] < 60):
        return
    _mc["at"] = time.time()
    try:
        with urllib.request.urlopen(MC_URL + "/api/tasks", timeout=6) as r:
            rows = json.loads(r.read())["tasks"]
    except Exception as e:
        _mc.update(ok=False, error=str(e)[:200])
        return
    mine = [t for t in rows if str(t.get("assignee") or "morty").lower() == "morty" and t.get("status") != "done"]

    def run():
        for t in mine:
            due = str(t.get("dueDate") or "")[:10]
            q("""INSERT INTO task (title, project, due_date, mc_task_id) VALUES (:t, :p, :d, :m)
                 ON CONFLICT (mc_task_id) DO UPDATE SET title = EXCLUDED.title, project = EXCLUDED.project,
                   due_date = EXCLUDED.due_date""",
              t=text(t.get("title"), 300) or "(untitled)", p=text(t.get("projectName"), 100) or None,
              d=datetime.date.fromisoformat(due) if len(due) == 10 else None, m=str(t["id"]))
        # Finished or deleted in Mission Control: drop it from the list here.
        q("""UPDATE task SET done_at = now() WHERE mc_task_id IS NOT NULL AND done_at IS NULL
              AND NOT (mc_task_id = ANY(CAST(:ids AS text[])))""", ids=[str(t["id"]) for t in mine])
    try:
        tx(run)
    except Exception as e:
        _mc.update(ok=False, error=str(e)[:200])
        return
    _mc.update(ok=True, error="")


def mc_status():
    return {"connected": bool(MC_URL), "ok": _mc["ok"], "error": _mc["error"]}


def list_tasks(search=""):
    sync_mc()
    return q("""SELECT id, title, project, due_date, created_at, mc_task_id IS NOT NULL AS from_mc FROM task
                 WHERE done_at IS NULL AND (:s = '' OR title ILIKE '%' || :s || '%' OR coalesce(project, '') ILIKE '%' || :s || '%')
                 ORDER BY due_date NULLS LAST, created_at DESC LIMIT 300""", s=text(search, 100))


def settings():
    return {
        "habits": q("SELECT * FROM habit ORDER BY archived_at NULLS FIRST, sort_order, id"),
        "routine": q("SELECT * FROM routine_item ORDER BY archived_at NULLS FIRST, sort_order, id"),
    }


def stats(days=30):
    days = max(7, min(int(days or 30), 365))
    since = datetime.date.today() - datetime.timedelta(days=days - 1)
    habits = q("""SELECT h.id, h.name, count(l.*) AS logged, count(l.*) FILTER (WHERE l.met) AS kept
                    FROM habit h
                    LEFT JOIN habit_log l ON l.habit_id = h.id
                     AND l.day_plan_id IN (SELECT id FROM day_plan WHERE plan_date >= :s)
                   WHERE h.archived_at IS NULL GROUP BY h.id ORDER BY h.sort_order, h.id""", s=since)
    # Current streak: days in a row, ending with the latest logged day, on which the habit was kept.
    logs = q("""SELECT l.habit_id, d.plan_date, l.met FROM habit_log l JOIN day_plan d ON d.id = l.day_plan_id
                 ORDER BY d.plan_date DESC""")
    for h in habits:
        streak, expect = 0, None
        for r in (x for x in logs if x["habit_id"] == h["id"]):
            if not r["met"] or (expect and r["plan_date"] != expect):
                break
            streak += 1
            expect = r["plan_date"] - datetime.timedelta(days=1)
        h["streak"] = streak
    return {
        "days": days,
        "habits": habits,
        "daily": q("SELECT * FROM v_daily_summary WHERE plan_date >= :s ORDER BY plan_date", s=since),
    }


# ---- writes ----------------------------------------------------------------------------------------

def toggle_routine(date, item_id, done):
    did = day_id(date)
    if done:
        q("INSERT INTO routine_check (day_plan_id, routine_item_id) VALUES (:d, :i) ON CONFLICT DO NOTHING", d=did, i=int(item_id))
    else:
        q("DELETE FROM routine_check WHERE day_plan_id = :d AND routine_item_id = :i", d=did, i=int(item_id))


def add_journal(date, kind, transcript):
    transcript = text(transcript, 20000)
    if not transcript:
        raise BadRequest("Write or say something first.")
    kind = kind if kind in ("morning", "evening") else "morning"
    return one("INSERT INTO journal_entry (day_plan_id, kind, transcript) VALUES (:d, :k, :t) RETURNING id",
               d=day_id(date), k=kind, t=transcript)


def delete_journal(entry_id):
    q("DELETE FROM journal_entry WHERE id = :i", i=int(entry_id))


def create_task(title, project=None, due=None):
    title = text(title, 300)
    if not title:
        raise BadRequest("A task needs a title.")
    return one("INSERT INTO task (title, project, due_date) VALUES (:t, :p, :d) RETURNING id, title, project, due_date",
               t=title, p=text(project, 100) or None, d=parse_date(due) if due else None)


def pick_task(date, slot, task_id=None, carried_from_id=None, title=None):
    if slot not in SLOTS:
        raise BadRequest("Unknown list.")

    def run():
        did = day_id(date)
        if slot in ("MIT", "LIT"):
            n = one("SELECT count(*) AS n FROM day_task WHERE day_plan_id = :d AND slot = :s", d=did, s=slot)["n"]
            cap = MIT_MAX if slot == "MIT" else LIT_MAX
            if n >= cap:
                raise BadRequest(f"{slot} is full ({cap} of {cap}). Swap one out to add another.")
        tid, snap = task_id, title
        if carried_from_id:
            src = one("SELECT task_id, title_snapshot FROM day_task WHERE id = :i", i=int(carried_from_id))
            if not src:
                raise BadRequest("That task no longer exists.")
            tid, snap = src["task_id"], src["title_snapshot"]
        if tid:
            t = one("SELECT title FROM task WHERE id = :i", i=int(tid))
            if not t:
                raise BadRequest("That task no longer exists.")
            snap = t["title"]
            if one("SELECT 1 AS x FROM day_task WHERE day_plan_id = :d AND task_id = :t", d=did, t=int(tid)):
                raise BadRequest("That task is already on today's list.")
        snap = text(snap, 300)
        if not snap:
            raise BadRequest("A task needs a title.")
        pos = one("SELECT coalesce(max(position), 0) + 1 AS p FROM day_task WHERE day_plan_id = :d AND slot = :s", d=did, s=slot)["p"]
        return one("""INSERT INTO day_task (day_plan_id, slot, position, task_id, title_snapshot, carried_from_id)
                      VALUES (:d, :s, :p, :t, :n, :c) RETURNING id""",
                   d=did, s=slot, p=pos, t=int(tid) if tid else None, n=snap, c=int(carried_from_id) if carried_from_id else None)
    return tx(run)


def move_task(day_task_id, slot):
    if slot not in SLOTS:
        raise BadRequest("Unknown list.")

    def run():
        t = one("SELECT day_plan_id, slot FROM day_task WHERE id = :i", i=int(day_task_id))
        if not t:
            raise BadRequest("That task is no longer on the list.")
        if t["slot"] == slot:
            return
        if slot in ("MIT", "LIT"):
            n = one("SELECT count(*) AS n FROM day_task WHERE day_plan_id = :d AND slot = :s", d=t["day_plan_id"], s=slot)["n"]
            cap = MIT_MAX if slot == "MIT" else LIT_MAX
            if n >= cap:
                raise BadRequest(f"{slot} is full ({cap} of {cap}). Swap one out to add another.")
        q("UPDATE day_task SET slot = :s WHERE id = :i", s=slot, i=int(day_task_id))
    tx(run)


def unpick(day_task_id):
    q("DELETE FROM day_task WHERE id = :i", i=int(day_task_id))


def update_day_task(day_task_id, data):
    i = int(day_task_id)

    def run():
        t = one("SELECT id, task_id, slot FROM day_task WHERE id = :i", i=i)
        if not t:
            raise BadRequest("That task is no longer on the list.")
        if "output_goal" in data:
            q("UPDATE day_task SET output_goal = :g WHERE id = :i", g=text(data["output_goal"], 500) or None, i=i)
        if "status" in data:
            st = data["status"]
            if st not in TASK_STATUS:
                raise BadRequest("Unknown status.")
            q("UPDATE day_task SET status = :s WHERE id = :i", s=st, i=i)
            if t["task_id"]:
                # A finished task leaves the task list; reopening it brings it back.
                q("UPDATE task SET done_at = CASE WHEN :s = 'done' THEN now() ELSE NULL END WHERE id = :t", s=st, t=t["task_id"])
        if "steps" in data:
            q("DELETE FROM mit_step WHERE day_task_id = :i", i=i)
            for n, s in enumerate(data["steps"] or [], 1):
                words = text(s.get("text") if isinstance(s, dict) else s, 300)
                if words:
                    q("INSERT INTO mit_step (day_task_id, position, text, done) VALUES (:i, :p, :t, :d)",
                      i=i, p=n, t=words, d=bool(isinstance(s, dict) and s.get("done")))
        if "starts_at" in data or "ends_at" in data:
            start, end = parse_time(data.get("starts_at")), parse_time(data.get("ends_at"))
            if not start and not end:
                q("DELETE FROM time_block WHERE day_task_id = :i", i=i)
            else:
                if not (start and end) or end <= start:
                    raise BadRequest("The block needs a start and an end, and the end must be after the start.")
                q("""INSERT INTO time_block (day_task_id, starts_at, ends_at) VALUES (:i, :s, :e)
                     ON CONFLICT (day_task_id) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at""",
                  i=i, s=start, e=end)
    tx(run)


def carry_to_tomorrow(day_task_id):
    """Put an unfinished task on the next day's list, in the same slot (the limits still apply)."""
    t = one("""SELECT t.slot, d.plan_date FROM day_task t JOIN day_plan d ON d.id = t.day_plan_id WHERE t.id = :i""", i=int(day_task_id))
    if not t:
        raise BadRequest("That task is no longer on the list.")
    nxt = t["plan_date"] + datetime.timedelta(days=1)
    already = one("""SELECT 1 AS x FROM day_task n JOIN day_plan d ON d.id = n.day_plan_id
                      WHERE d.plan_date = :n AND n.carried_from_id = :i""", n=nxt, i=int(day_task_id))
    if already:
        return {"already": True}
    return pick_task(nxt, t["slot"], carried_from_id=day_task_id)


def set_plan_flag(date, flag):
    col = {"confirmed": "confirmed_at", "printed": "printed_at"}[flag]
    q(f"UPDATE day_plan SET {col} = now() WHERE id = :d", d=day_id(date))


def log_habit(date, habit_id, value=None, met=None):
    h = one("SELECT * FROM habit WHERE id = :i", i=int(habit_id))
    if not h:
        raise BadRequest("That habit no longer exists.")
    did = day_id(date)
    if value in ("", None) and met is None:
        q("DELETE FROM habit_log WHERE day_plan_id = :d AND habit_id = :h", d=did, h=h["id"])
        return
    num = None
    if h["kind"] == "number":
        try:
            num = decimal.Decimal(str(value))
        except Exception:
            raise BadRequest(f"Enter a number for {h['name']}.")
        met = h["target"] is not None and num >= h["target"]
    q("""INSERT INTO habit_log (day_plan_id, habit_id, value, met) VALUES (:d, :h, :v, :m)
         ON CONFLICT (day_plan_id, habit_id) DO UPDATE SET value = EXCLUDED.value, met = EXCLUDED.met, logged_at = now()""",
      d=did, h=h["id"], v=num, m=bool(met))


def save_review(date, data):
    vals = {}
    for k in ("energy", "focus", "mood", "sleep"):
        v = data.get(k)
        if v in (None, ""):
            vals[k] = None
        else:
            v = int(v)
            if not 1 <= v <= 5:
                raise BadRequest("Ratings go from 1 to 5.")
            vals[k] = v
    q("""UPDATE day_plan SET energy = :energy, focus = :focus, mood = :mood, sleep = :sleep,
            review_note = :note, reviewed_at = CASE WHEN :done THEN now() ELSE reviewed_at END WHERE id = :d""",
      d=day_id(date), note=text(data.get("note"), 2000) or None, done=bool(data.get("done")), **vals)


def save_gratitude(date, position, statement):
    position = int(position)
    if not 1 <= position <= 4:
        raise BadRequest("There are 4 gratitude spots.")
    q("""INSERT INTO gratitude (day_plan_id, position, statement) VALUES (:d, :p, :s)
         ON CONFLICT (day_plan_id, position) DO UPDATE SET statement = EXCLUDED.statement""",
      d=day_id(date), p=position, s=text(statement, 500) or None)


def save_habit(data):
    name = text(data.get("name"), 100)
    if not name:
        raise BadRequest("A habit needs a name.")
    kind = data.get("kind") if data.get("kind") in ("yes_no", "number") else "yes_no"
    target = None
    if kind == "number":
        try:
            target = decimal.Decimal(str(data.get("target")))
        except Exception:
            raise BadRequest("A number habit needs a target, like 12000.")
    days = "".join(ch for ch in "1234567" if ch in str(data.get("days_of_week") or "1234567")) or "1234567"
    p = dict(n=name, k=kind, t=target, u=text(data.get("unit"), 20) or None, w=days,
             o=int(data.get("sort_order") or 0), a=bool(data.get("archived")))
    if data.get("id"):
        q("""UPDATE habit SET name = :n, kind = :k, target = :t, unit = :u, days_of_week = :w, sort_order = :o,
                archived_at = CASE WHEN :a THEN coalesce(archived_at, now()) ELSE NULL END WHERE id = :i""", i=int(data["id"]), **p)
        return {"id": int(data["id"])}
    return one("""INSERT INTO habit (name, kind, target, unit, days_of_week, sort_order, archived_at)
                  VALUES (:n, :k, :t, :u, :w, :o, CASE WHEN :a THEN now() END) RETURNING id""", **p)


def save_routine_item(data):
    name = text(data.get("name"), 100)
    if not name:
        raise BadRequest("A routine item needs a name.")
    p = dict(n=name, o=int(data.get("sort_order") or 0), a=bool(data.get("archived")))
    if data.get("id"):
        q("""UPDATE routine_item SET name = :n, sort_order = :o,
                archived_at = CASE WHEN :a THEN coalesce(archived_at, now()) ELSE NULL END WHERE id = :i""", i=int(data["id"]), **p)
        return {"id": int(data["id"])}
    return one("INSERT INTO routine_item (name, sort_order, archived_at) VALUES (:n, :o, CASE WHEN :a THEN now() END) RETURNING id", **p)


def seed_defaults():
    # First run only: the habits and routine from the plan, so the app isn't empty. All editable in Settings.
    if not one("SELECT 1 AS x FROM habit LIMIT 1"):
        for n, (name, kind, target, unit) in enumerate([
                ("Walked 12,000 steps", "number", 12000, "steps"),
                ("Ate only keto", "yes_no", None, None),
                ("No sugar", "yes_no", None, None),
                ("Drank water", "number", 2.5, "L")], 1):
            save_habit({"name": name, "kind": kind, "target": target, "unit": unit, "sort_order": n})
    if not one("SELECT 1 AS x FROM routine_item LIMIT 1"):
        for n, name in enumerate(["Glass of water", "5 minutes of daylight", "Phone greyscale on", "Breathing exercise"], 1):
            save_routine_item({"name": name, "sort_order": n})

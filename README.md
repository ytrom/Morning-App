# Morning App

Morty's morning routine and evening review: routine ticks, a journal, four gratitude lines, picking 3 MITs and
10 LITs, planning each MIT's output and time block, a printed one-page day report, and habit tick-offs recorded
in Postgres for reporting. It runs on the Synology NAS in Container Manager, the same way as Our Second Dance,
and is reached away from the office through a Cloudflare tunnel behind the Cloudflare email login.

The plan is in the project's Product Plan doc, and the screens follow the Claude Design mock-up.

## What's here

| Path | What it is |
|---|---|
| `index.html`, `site/app.js`, `site/app.css` | The web page and phone app: Morning, Tasks, Plan, Evening, Stats and Settings |
| `report.html` | The printable A4 day report (`/report.html?date=2026-10-16`) |
| `manifest.json`, `sw.js`, `site/icons/` | Lets the phone install it as an app |
| `_kit/serve.py` | The server (Python standard library), with the Cloudflare Access check and the `/api/` calls |
| `_kit/db.py` | The Postgres tables (created on start), the 3 MIT / 10 LIT limits, and every read and write |
| `_kit/nas/` | Container Manager setup: Dockerfile, the office-only and tunnel versions of `docker-compose.yml`, `NAS-SETUP.md` |
| `Start-Local-Server.cmd` | Runs it on a PC against the NAS database |

## Reporting

Every day is one row in `day_plan`; habits are in `habit` and `habit_log`. The view `v_daily_summary` gives one row
per day (MITs planned and done, LITs, habits kept, the four ratings): point Power BI, Excel or Metabase at it.

## Not built yet (phase 2)

- Mission Control tasks (the task list is local until its API is known)
- Whisper voice journal (the phone keyboard's microphone works meanwhile)
- OneDrive gratitude photos and Outlook calendar blocks (one Microsoft sign-in)

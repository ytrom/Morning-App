# Work follow-up: deploy steps

Brings Mission Control's follow-up flow to the phone's Work tab:
- **Work › Today** (app/work.html): "+ Add step" on an MIT; "⏸ Done for today, waiting on…" (who, chase date, optional
  next step, note) puts it on Mission Control's Waiting list and marks the MIT done for today; a **Chase today** section
  (Chased · still waiting / Back · make it an MIT / Make it a LIT / Close); a **Waiting on others** list; done MITs shut to
  one line and drop to the bottom.
- **Work › Calendar** (app/cal.html): parked MITs show green with ⏸, "waiting on X" and the chase day; done blocks get ✓;
  anything due a chase shows at the top of that day.
- **server.py**: new /api/mc/waiting (GET, POST, PATCH) and POST /api/mc/day-plan, passed through to Mission Control's
  /api/waiting and /api/day-plan with only the expected fields. **server.py changes, so the container needs a restart.**

Needs Mission Control with /api/waiting (live on .253 since the MC Work page follow-up deploy).

## Live files these replace (check first; stop if different)
| File | Live MD5 before |
|---|---|
| server.py | 95e6b5f50993a1a0e451ad619ac5e5ec |
| app/work.html | 8f6f9ff1d7abe6a46fcb92a95aa47082 |
| app/cal.html | 6d435309f65fbe8d3cce0101cc7b56aa |

## Files to copy to S:\morning-workout-app\
| File | MD5 |
|---|---|
| server.py | 45626b6e781f3fc7bcf0da80554421ea |
| app\work.html | 89656948ee7e0ff366e3e6b4707d314c |
| app\cal.html | 637c0249cc615c8f47a1faf710069c61 |

## Steps
1. Check the live MD5s. Back up those 3 files to C:\temp\morning-routine-backup\ with the suffix `.before-followup`.
2. Copy the 3 files and check their MD5s.
3. Restart the container: Synology Container Manager › Container › morning-workout › Restart.
4. Open the app, Work › Today: each open MIT has "+ Add step" and "⏸ Done for today, waiting on…".

## Rollback
Copy the `.before-followup` files back and restart the container.

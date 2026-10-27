# Workout link v2: deploy steps (NAS)

Ticking **Exercise program** on the Disciplines page now ticks (or unticks) that day's Mission Control scheduled
task with "workout" in its title (e.g. "Morning Workout"). It only syncs when that box changes, so saving other
habits never unticks it. Ticking exercises on the Workout tab still ticks it too (clearing them all unticks it).
On start-up, days in the last two weeks with Exercise program ticked are ticked in Mission Control too
(catch-up only, nothing is unticked), so Mon and Tue fill in after the restart.
Only server.py changes, so the **container needs a restart**.

| File | Live MD5 before | New MD5 |
|---|---|---|
| server.py | 135e1ca76e7bdbd79cfec3084c2d4ee9 | 82ddbeebe7e2b67e44a3ee910824e7d3 |

## Steps
1. Check the live MD5 (stop if different). Back up to C:\temp\morning-routine-backup\server.before-workoutlink2.py.
2. Copy server.py to S:\morning-workout-app\server.py and check its MD5.
3. Morty restarts the container: Container Manager > Container > morning-workout > Action > Restart.

## Rollback
Copy the backup back and restart.

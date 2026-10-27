# Workout link: deploy steps (NAS part)

When a day's Workout ticks are saved, server.py now ticks that day's Mission Control scheduled task that has
"workout" in its title (any exercise ticked = ticked; all cleared = unticked). It runs in the background, so a
slow or offline Mission Control never holds up saving. Only server.py changes, so the **container needs a restart**.

| File | Live MD5 before | New MD5 |
|---|---|---|
| server.py | 45626b6e781f3fc7bcf0da80554421ea | 135e1ca76e7bdbd79cfec3084c2d4ee9 |

## Steps
1. Check the live MD5 (stop if different). Back up to C:\temp\morning-routine-backup\server.before-workoutlink.py.
2. Copy server.py to S:\morning-workout-app\server.py and check its MD5.
3. Morty restarts the container: Container Manager > Container > morning-workout > Action > Restart.

## Rollback
Copy the backup back and restart.

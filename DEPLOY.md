# Work button (MITs from Mission Control): deploy steps

Built 26 Oct 2026 on the live NAS files (MD5s checked against S:\morning-workout-app the same day).
Adds a **Work** button between Morning Routine and Evening Routine. Work › Today shows the day's MITs (timed steps) and LITs
from Mission Control (192.168.0.253:3000), and ticks save back to it. The + button on every page adds a note to the Mission Control Inbox.
The phone only talks to the NAS; server.py calls Mission Control over the LAN (`MC_URL`, default `http://192.168.0.253:3000`).

This replaces the Evening Planning build (day-planning/evening-build). Don't deploy that one as well.

## Live files these are built on (stop if the NAS copy doesn't match)
| File | Live MD5 before |
|---|---|
| server.py | 6c6f8c7eff826425050ccb5140b75afa |
| app/nav.js | 9c972652cee6f55a45b2bd71cff494b6 |
| app/index.html | 7c77f5e9abcaba15effcadca4ae28ccd |
| app/routine.html | 3afd6c355d38e5f8c6af90aa98c8c0ee |
| app/performance.html | 3fabefab2bf020f40ab0136ca724b38f |
| app/soon.html | 8b3d03fbdb203a46bd3c11f7ef90fb10 |

## Files to copy
| File | Where on the NAS | MD5 |
|---|---|---|
| server.py | S:\morning-workout-app\server.py | 95e6b5f50993a1a0e451ad619ac5e5ec |
| app/nav.js | S:\morning-workout-app\app\nav.js | d8d1f0c1acd1c1bc52326e1700693af4 |
| app/work.html (new) | S:\morning-workout-app\app\work.html | 9ec729b33e04433ebdb0b674eb89609b |
| app/index.html | S:\morning-workout-app\app\index.html | 3da3a8198d10bda142d2666ef9ea0596 |
| app/routine.html | S:\morning-workout-app\app\routine.html | 900e6db07a5bf7f42f5cc11499152ccd |
| app/performance.html | S:\morning-workout-app\app\performance.html | 24117fb3798d453598b90b9e1ee3ab51 |
| app/soon.html | S:\morning-workout-app\app\soon.html | 2e899191b7f1700cdb9fc8ed5647321a |

index/routine/performance only change `nav.js?v=3` to `nav.js?v=4`; soon.html also gets a "Calendar" coming-soon title.

## Steps
1. Check the live MD5s above. Back up those 6 files to `C:\temp\morning-routine-backup\` with the suffix `.before-work`.
2. Copy the 7 files onto the NAS and check their MD5s.
3. Restart the container (server.py changed): Container Manager > Container > morning-workout > Action > Restart. No rebuild.
4. Check: open https://workout.ourseconddance.au, tap Work, and see today's MITs.

## Rollback
Copy the `.before-work` files back, delete app\work.html, restart the container.

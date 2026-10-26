# App Calendar tab: deploy steps

Adds Work › Calendar (app/cal.html): the day's MIT and LIT blocks from Mission Control on a 5am to 10pm timeline,
tap a block to tick its steps. nav.js points the Calendar tab at cal.html (v=5); the other pages only bump `nav.js?v=4` to `?v=5`
(work.html also links Calendar to cal.html). server.py is unchanged, so **no container restart is needed**.

## Live files these replace (check first; stop if different)
| File | Live MD5 before |
|---|---|
| app/nav.js | d8d1f0c1acd1c1bc52326e1700693af4 |
| app/index.html | 3da3a8198d10bda142d2666ef9ea0596 |
| app/routine.html | 900e6db07a5bf7f42f5cc11499152ccd |
| app/performance.html | 24117fb3798d453598b90b9e1ee3ab51 |
| app/soon.html | 2e899191b7f1700cdb9fc8ed5647321a |
| app/work.html | 9ec729b33e04433ebdb0b674eb89609b |

## Files to copy to S:\morning-workout-app\app\
| File | MD5 |
|---|---|
| cal.html (new) | 6d435309f65fbe8d3cce0101cc7b56aa |
| nav.js | 2a633313ff5f315dc0cc39861e397a1d |
| index.html | c83818db1cb9a702743e54bf6981ddcd |
| routine.html | fbaad2429dd4422322628e78f54c043a |
| performance.html | 868b717d7147fc2d3ef8590e81698083 |
| soon.html | 08b8c63bac536b4e774f79323e2c86c7 |
| work.html | 8f6f9ff1d7abe6a46fcb92a95aa47082 |

## Steps
1. Check the live MD5s. Back up those 6 files to C:\temp\morning-routine-backup\ with the suffix `.before-cal`.
2. Copy the 7 files and check their MD5s.
3. Open the app, tap Work › Calendar (close and reopen the home-screen app if it shows the old tabs).

## Rollback
Copy the `.before-cal` files back and delete app\cal.html.

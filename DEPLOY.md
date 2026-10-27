# Offload Idea button: deploy steps

Removes the floating + button from every page. Work › Today gets an **Offload Idea** button instead, right-aligned above
today's MITs and LITs. It opens the same sheet as before (Task or Idea, saved to the Mission Control Inbox).
nav.js now opens the sheet only when the button asks (`window.mcOffload`). Every page bumps `nav.js?v=5` to `?v=6`.
server.py is unchanged, so **no container restart is needed**.

## Live files these replace (check first; stop if different)
| File | Live MD5 before |
|---|---|
| app/nav.js | 2a633313ff5f315dc0cc39861e397a1d |
| app/cal.html | 6d435309f65fbe8d3cce0101cc7b56aa |
| app/index.html | c83818db1cb9a702743e54bf6981ddcd |
| app/routine.html | fbaad2429dd4422322628e78f54c043a |
| app/performance.html | 868b717d7147fc2d3ef8590e81698083 |
| app/soon.html | 08b8c63bac536b4e774f79323e2c86c7 |
| app/work.html | 8f6f9ff1d7abe6a46fcb92a95aa47082 |

## Files to copy to S:\morning-workout-app\app\
| File | MD5 |
|---|---|
| nav.js | d0f19e66d93f09428c3b430d17b4a0b1 |
| cal.html | 469852325bde003c47cd5395ff7a443b |
| index.html | 104673987e12c5b231b54c1e389977ae |
| routine.html | f8de137a7efe424611cb9ecf43dfa030 |
| performance.html | 944256497a5dff372992e418f293cbfc |
| soon.html | 4b27ccde9d32c2db1cf075ed4e6ebe42 |
| work.html | 6639917a60d823dbc63f8e5b28ccb7ba |

## Steps
1. Check the live MD5s. Back up those 7 files to C:\temp\morning-routine-backup\ with the suffix `.before-offload`.
2. Copy the 7 files and check their MD5s.
3. Open the app, tap Work. Close and reopen the home-screen app if the + still shows.

## Rollback
Copy the `.before-offload` files back.

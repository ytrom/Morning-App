# Open a parked MIT (Follow up): deploy steps (NAS)

Work › Today: an MIT parked "Done for today, waiting on…" gets an **Open ›** button. It opens that Follow up
card and scrolls to it. Opened Follow up cards can now change who it's waiting on and add a dated note (Save).
server.py now passes waitingOn through on PATCH /api/mc/waiting, so the **container needs a restart**.

| File | Live MD5 before | New MD5 |
|---|---|---|
| app/work.html | fb45e561f6dd9dc47cb45234ad599962 | 475f4eb9f1a9747f0ebfd82bb3ae5fc2 |
| server.py | ada91a42ae50706b821e6bdb2fc54779 | 80e19168b799494d02b064a483538802 |

## Steps
1. Check the live MD5s (stop if different). Back up both to C:\temp\morning-routine-backup\ with the suffix .before-followupopen.
2. Copy both files and check their MD5s.
3. Morty restarts the container: Container Manager > Container > morning-workout > Action > Restart.

## Rollback
Copy the .before-followupopen files back and restart.

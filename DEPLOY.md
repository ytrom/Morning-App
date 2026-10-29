# Open a chase card: deploy steps (NAS)

Work › Today: tapping a Waiting card opens it. You see the items still to do (tick them or add one), the
notes, then the buttons. Closed cards say how many items are still open. Sign off warns when items are
still open. server.py now passes steps through on PATCH /api/mc/waiting, so the **container needs a restart**.
Mission Control needs the matching /api/waiting change (branch design/chase-open) deployed too, or ticks won't save.

| File | Live MD5 before | New MD5 |
|---|---|---|
| app/work.html | 89c33b478df737ea2886d387556fbc67 | fb45e561f6dd9dc47cb45234ad599962 |
| server.py | c07be7ad83397d75781100f39c1465d2 | ada91a42ae50706b821e6bdb2fc54779 |

## Steps
1. Check the live MD5s (stop if different). Back up both to C:\temp\morning-routine-backup\ with the suffix .before-chaseopen.
2. Copy both files and check their MD5s.
3. Morty restarts the container: Container Manager > Container > morning-workout > Action > Restart.

## Rollback
Copy the .before-chaseopen files back and restart.

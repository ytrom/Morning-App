# Chase sign-off: deploy steps (NAS)

Work › Today: every Waiting card gets **✓ Sign off** (note optional, then "Done · close it out"). It closes the
waiting item in Mission Control and keeps "Signed off <date>: <note>" on it. It needs no room on today's list, so
it works with three MITs planned. Cards also show the steps left. "Back · make it an MIT" on a full day now says
why and suggests signing off or a LIT. server.py now passes the note through on PATCH /api/mc/waiting, so the
**container needs a restart**.

| File | Live MD5 before | New MD5 |
|---|---|---|
| app/work.html | b6a9fef68e011d29c57cafc2bab76694 | 89c33b478df737ea2886d387556fbc67 |
| server.py | 82ddbeebe7e2b67e44a3ee910824e7d3 | c07be7ad83397d75781100f39c1465d2 |

## Steps
1. Check the live MD5s (stop if different). Back up both to C:\temp\morning-routine-backup\ with the suffix .before-signoff.
2. Copy both files and check their MD5s.
3. Morty restarts the container: Container Manager > Container > morning-workout > Action > Restart.

## Rollback
Copy the .before-signoff files back and restart.

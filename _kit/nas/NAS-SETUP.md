# Morning App on the DS225+

Set up the same way as Our Second Dance: the code sits in a shared folder, Container Manager runs it,
and a Cloudflare tunnel with the Access email login makes it reachable away from the office.

## Stage 1: on the office network

1. **File Station**: make a shared folder `morningapp` (Control Panel > Shared Folder) and copy this repo into
   `morningapp/morning-app`. In the `docker` shared folder make `docker/morning-app` and `docker/morning-app/pgdata`.
2. Copy `Dockerfile` and `docker-compose.yml` from `morning-app/_kit/nas/` into `docker/morning-app`.
3. In `docker/morning-app`, make a text file called `.env` containing one line: `POSTGRES_PASSWORD=<a long password>`.
   Avoid the `$` sign. This file never goes in GitHub.
4. **Container Manager > Project > Create**: name `morning-app`, path `docker/morning-app`,
   *Use the existing docker-compose.yml*, then **Done**. It builds the web container and starts Postgres.
5. On a computer in the office, open `http://DS225_Morty:8090`. On first start the app creates its tables and
   adds the starter habits and routine (change them under Settings, the gear at the top right).

## Stage 2: away from the office (only when you say go)

Done in this order, so it is never open without a login:

1. **Cloudflare Zero Trust > Access > Applications**: add a *Self-hosted* app for the address you want,
   for example `morning.ourseconddance.au`, with a policy that allows only your email (one-time PIN).
   Copy its **Application Audience (AUD) Tag**.
2. **Zero Trust > Networks > Tunnels**: create a *Cloudflared* tunnel, copy its token, and add the public hostname
   pointing at `http://web:8090`. (Or add the hostname to the existing Our Second Dance tunnel, pointing at
   `http://<NAS IP>:8090`, and skip the tunnel container below.)
3. In `docker/morning-app`, replace `docker-compose.yml` with `docker-compose.tunnel.yml` (renamed), put the AUD tag in
   `ACCESS_AUD`, and add `TUNNEL_TOKEN=<token>` to `.env`. **Project > Action > Build** to restart it.
4. On your phone, open the address, sign in, then **Share > Add to Home Screen** (iPhone) or
   **Install app** (Android). It now opens like an app.

Through the tunnel every request must carry a valid Cloudflare Access login, or the server refuses it.

## Updating

Copy the changed files into `morningapp/morning-app`. Pages and `site/*` take effect on refresh; changes to
`_kit/*.py` need **Container Manager > Container > morning-app-web > Action > Restart**.

## Backups

Postgres keeps its data in `docker/morning-app/pgdata`. Hyper Backup that folder, or run
`docker exec morning-app-db pg_dump -U morning morning > morning-backup.sql` from the NAS command line.

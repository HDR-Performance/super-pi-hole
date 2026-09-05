# Install Super Pi Hole alongside Pi-hole

This package adds a web interface on a separate port. It does **not** install a
second DNS or DHCP server, replace Pi-hole, enable blocking, or change a router.
Use a Pi-hole v6 installation. The connector contract was checked against FTL
v6.6 definitions; newer versions should be verified before enabling live writes.

## Before starting

1. Export a backup from the original Pi-hole's **Settings → Teleporter**. Keep
   it private; it can contain sensitive configuration.
2. Note Pi-hole's web/API address and current blocking state.
3. Choose an unused GUI port (examples use **20721**, separate from Pi-hole's port).
4. Set a unique administrator password of 16–256 characters. Do not reuse the
   Pi-hole password or the synthetic fixture password.
5. Restrict access to a trusted management LAN. Add HTTPS for continued use.
   Neither this app nor its examples create router port forwards.

## A. Build a Docker container from source

Clone the public repository and work from its root. Copy `.env.example` to a
private file called `.env`, then edit the values. The file is ignored by Git.

```sh
docker compose --env-file .env -f deploy/compose.yaml config --quiet
docker compose --env-file .env -f deploy/compose.yaml up -d --build
```

The build runs the tests and compiles the frontend. It may take several minutes
and requires Internet access for the official Node image and npm dependencies.
The final image runs as UID/GID 568, has a read-only root filesystem and no Linux
capabilities, and only writes to its own data volume. Do not add `privileged`,
host networking, or a Docker-socket mount.

Open the exact `PUBLIC_ORIGIN` you configured. The database survives an ordinary
container recreation. Do not use `docker compose down -v` unless you deliberately
want to destroy this app's volume and saved policy-review settings.

## B. TrueNAS SCALE: upload bundle + Install via YAML

For the Docker-Compose-based Apps system (SCALE 24.10 and newer). Exact menu
placement varies by release. TrueNAS performs only basic YAML validation; see
[its Custom App documentation](https://www.truenas.com/docs/scale/apps/installcustomappscreens/).

Build on a computer with Node 24:

```sh
npm ci
npm test
npm run build:server
npm run package:server
```

The packager prints a versioned directory and `.tar.gz` path under `release/`.
Upload and extract that bundle into a **new dedicated dataset directory**, not
an existing Pi-hole mount. The directory must contain `server/`, `lib/`,
`standalone-dist/`, and `deploy/`. Verify its manifest using:

```sh
node deploy/verify-bundle.mjs /path/to/extracted/bundle
```

If Node is unavailable on TrueNAS, use the official Node container to verify
the already-uploaded bundle, substituting its exact absolute host path:

```sh
docker run --rm --network none --read-only \
  --mount type=bind,src=/mnt/POOL/apps/super-pi-hole-0.2.0-test,dst=/app,readonly \
  node:24-bookworm-slim node /app/deploy/verify-bundle.mjs /app
```

Open **Apps → Discover → Install via YAML** (or the Custom App menu) and use
`deploy/truenas.yaml`. Name it distinctly, for example `super-pi-hole-test`.
Edit the YAML before submitting:

- Both bind-mount sources: the extracted versioned directory you uploaded.
- Port host IP and `PUBLIC_ORIGIN`: your TrueNAS LAN IP; keep ports consistent.
- `PIHOLE_URL`: the existing Pi-hole web origin, not `/admin/`.
- `SUPER_PIHOLE_PASSWORD`: a unique new password. The placeholder prevents startup.
- `PIHOLE_PASSWORD`: the Pi-hole/application password, or empty only if the
  existing Pi-hole intentionally has no password. Never weaken its authentication.

Keep `PIHOLE_WRITE_ENABLED: 'false'` for the first test. The example addresses
are documentation-only, not discovery results for your network.

The `init-data` service sets ownership **only on the root directory of this
new app's named data volume**. It has no network and no Pi-hole volumes. The app
then runs as UID/GID 568. The source bundle is mounted read-only. TrueNAS should
show the init service as completed and the web service as healthy.

This path runs compiled files with an official Node image; it does not download
source at container startup, use a nonexistent custom image, or need npm inside
the running app. The Node 24 base tag receives upstream updates; record its
resolved digest when reproducing a deployment exactly.

## C. Native Node 24

After building, set these environment variables in your service manager or shell:

| Variable | Meaning |
| --- | --- |
| `PUBLIC_ORIGIN` | Exact browser origin, such as `http://127.0.0.1:8080`; no path |
| `SUPER_PIHOLE_PASSWORD` | Required separate admin password, 16–256 characters |
| `PIHOLE_URL` | Existing Pi-hole origin, optional `/api`; empty means disconnected |
| `PIHOLE_PASSWORD` | Pi-hole password or application password |
| `PIHOLE_WRITE_ENABLED` | `false` initially; only literal `true` unlocks live mutations |
| `HOST` / `PORT` | Default `127.0.0.1` / `8080`; choose LAN exposure deliberately |
| `DATA_DIR` | Persistent app data directory; never `/etc/pihole` |
| `STATIC_DIR` | Compiled UI directory; default `standalone-dist` |

`SUPER_PIHOLE_PASSWORD_FILE` and `PIHOLE_PASSWORD_FILE` read secrets from files
instead of environment values. Protect those files, backups, and TrueNAS app
configuration. A file variable takes precedence over its direct value.

Run `node server/runtime.mjs`. For an extracted bundle, run from the bundle root.
Use a service manager for automatic restart. HTTPS termination must preserve the
configured Host and use an HTTPS `PUBLIC_ORIGIN`; arbitrary forwarded headers
are not trusted. Do not disable certificate validation for the upstream API.

## First-install checks

1. `/healthz` reports process health; this does **not** prove Pi-hole connectivity.
2. Sign in. Compare the Live Pi-hole dashboard with the original interface.
3. Verify the reported blocking state is unchanged and live action buttons are locked.
4. Inspect a known client's DNS queries. Routers that proxy DNS can hide identity.
5. Verify app settings survive restarting only this new app.
6. Confirm stopping Super Pi Hole has no effect on ordinary DNS service.

Only after these checks, deliberately set `PIHOLE_WRITE_ENABLED=true` if wanted.
Confirmations in the Live Pi-hole section change the **real existing Pi-hole**.
Simulator Save/Undo does not undo live mutations. Config operations may be denied
by application-password permissions or environment-locked Pi-hole options; use
the original interface instead of weakening protections just to make a button work.

## Validation boundary

Local automated and compiled-runtime tests do not prove a particular TrueNAS
version, permissions layout, CPU architecture, or Pi-hole mutation works on real
hardware. Review the repository's CI result and test on your own installation.
This release is not a validated replacement DNS appliance.

# Non-destructive adoption and upgrades

For the **0.3.0 integrated DNS upgrade**, follow [Integrated TrueNAS upgrade](docs/INTEGRATED-UPGRADE.md).
The older additive companion path below remains available for development.

## Existing Pi-hole → Pi-hole with Super Pi Hole

The first upgrade path is an **additive companion**, not an in-place conversion.
Pi-hole stays installed with its original DNS/DHCP service, API, passwords,
lists, groups, addresses, and volumes. No installer in this repository runs
`pihole -up`, rewrites `/etc/pihole`, or replaces router DNS.

Run the optional read-only compatibility planner with Node 24:

```sh
PIHOLE_URL=http://pi.hole node tools/upgrade-plan.mjs
```

In PowerShell:

```powershell
$env:PIHOLE_URL = 'http://pi.hole'
node tools/upgrade-plan.mjs
```

Use `PIHOLE_PASSWORD_FILE` when authentication is required. The planner checks
API version and current DNS blocking state, then prints an adoption plan. It
does not install anything or modify Pi-hole. Authentication may create an API
session; the planner never deletes other applications' sessions.

1. Take a Pi-hole Teleporter backup and, if relevant, a storage snapshot.
2. Install the companion with a separate port and a separate data volume.
3. Keep live writes locked. Verify readings against the original interface.
4. Verify a known test client's attribution before naming family profiles as if
   they were live identities. Check DHCP DNS and IPv6 separately; do not launch
   a competing DHCP server.
5. Unlock mutations only if you want the new GUI to administer the existing Pi-hole.

**Rollback:** stop only the new companion. Original Pi-hole continues working.
If you made live rules/records through the companion, stopping it does not undo
those writes. Review them in Pi-hole or restore an appropriate backup deliberately.

## Updating the Super Pi Hole companion

Keep the previous image or versioned bundle and the exact deployment configuration.
Export review settings, stop **only this app** before copying its SQLite database
(including any WAL/SHM files), and preserve the data volume. Never copy a live
SQLite file by itself or delete a volume as an update step.

For a source-built container, inspect the new source and changelog, rerun tests,
then rebuild/recreate the companion through the same Compose project. For the
TrueNAS bundle, verify the new manifest and change the two read-only source
mounts to its new versioned directory. Do not overwrite files mounted by a
running app. Keep the data volume and password settings unchanged.

This release accepts app database schema version 1 and fails closed on an
unknown version. Future incompatible migrations must ship explicit backups,
migration tests, and a documented rollback boundary. Downgrading an image is
not automatically safe after a database migration.

## Future in-place migration

A true replacement/upgrade of the underlying resolver is **not implemented**.
It needs version detection, Teleporter compatibility, DHCP lease handling,
DNSSEC/IPv6/cache tests, data-schema migrations, health checks, and recovery
testing before it is safe to offer. Do not label the current planner an automatic
Pi-hole-to-Super-Pi-Hole converter.

# Super Pi Hole 0.4.0-test

Testing prerelease, not a production security appliance. The pinned Pi-hole
core 6.4.1 / FTL 6.6 / web 6.5 source baseline is unchanged and fully included
in this public repository. No household passwords or query data are included.

## Included

- Live group-based family DNS controls: nine social-platform switches, website
  schedules with time zones/overnight windows, and a registered-family DNS pause.
  A server-owned scheduler operates even with the browser closed.
- Balanced default keeps YouTube and social media available; known-threat and
  privacy lists are separate from opt-in platform restrictions. Existing native
  rules remain in effect, and no allow-all bypass is added.
- Clear timed/indefinite blocking controls, automatic engine-owned resumption,
  native group/list/client/rule editors, typed DNS/DHCP/privacy settings,
  stored-history views, diagnostics, logs and maintenance controls.
- Per-device observed-DNS activity and history links, managed-rule conflicts and
  persistent family notifications. Detailed controller events: 0–30 days;
  daily change/error counts: up to 365 days (not bandwidth totals).
- Pre-upgrade verified backups now include BOTH original Pi-hole directories
  and the Super Pi Hole data directory, including its family database.
- Separate digest-pinned upgrade YAML for the existing one-app installation
  that retains its external GUI data volume and correct Web UI portal.

## Choose the correct YAML

**Existing installation on 192.168.0.8:** use
`super-pi-hole-existing-app-upgrade.yaml`. It retains
`ix-super-pi-hole_super-pi-hole-data` and the original Pi-hole config/dnsmasq
directories. It refuses to start if the existing controller database is absent.
This is one TrueNAS app with DNS/GUI services and a one-time backup container,
not a second app.

The other asset, `super-pi-hole-truenas-upgrade.yaml`, uses dataset bind mounts
and is for the documented original-Pi-hole migration layout. It is NOT a
substitute for the external-volume template.

Save your working YAML and take independent snapshots/backups first. Stop the
`pihole` app before replacement; keep the former standalone companion stopped.
Copy your current GUI password into the anchor and preserve the current
`PIHOLE_PASSWORD` value. No password reset is required. Do not delete app data.
Start the existing app after saving. A successful backup container exits;
DNS and GUI continue running.

Main GUI: `http://192.168.0.8:20721/`. Router DNS: `192.168.0.8` without a port.
Read [upgrade and rollback instructions](INTEGRATED-UPGRADE.md).

## Validation and limits

Publication is gated by automated tests, TypeScript, a standalone GUI build,
Compose validation, pinned-source verification, and real source-built Linux
amd64 container checks. The integrated checks cover group isolation, social
toggle removal, scheduled A/AAAA blocks, native allowlist precedence, timed
and indefinite blocking, typed-settings readback, and restart persistence.
No live household network is used in CI. A successful CI run is not proof of
a successful migration on your NAS; hardware and comprehensive browser/device
acceptance remain separate testing gates.

DNS-only controls cannot close existing connections, stop direct-IP/VPN/other
DNS bypass, guarantee a complete social-platform block, or override Pi-hole
allowlist precedence. Country firewall enforcement, incoming-country/byte
telemetry, year-long traffic totals, custom-media block pages and universal
HTTPS redirection are NOT implemented. Teleporter import is still pending.
No new family restrictions or blocklists are silently enabled during upgrade.

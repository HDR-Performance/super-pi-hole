# Super Pi Hole

An independent, self-hosted distribution of **Pi-hole v6** with a custom
controller, device center, and family-policy design workspace. The complete
pinned upstream sources are public under `vendor/`, with original licenses.

**0.3.0-test is an integrated test release, not a production security appliance.**
It includes a source-built DNS engine. Upgrade instructions and rollback are in
[Integrated TrueNAS upgrade](docs/INTEGRATED-UPGRADE.md). Only use published
release artifacts whose integrated-container tests passed.
Pi-hole, TrueNAS, TP-Link, NETGEAR, and Ubiquiti do not sponsor or endorse it.

## What works

| Capability | Status |
| --- | --- |
| Live DNS statistics, top clients/domains, upstream performance | Pi-hole v6 API connector |
| Query/client timelines, query-type and upstream donuts | Live data; selectable series, 1/6/24-hour chart windows, query drill-down and optional refresh |
| Query log, domain/client/result filters, older-query pagination | Live, up to 100 requests per page |
| Enable blocking and timed pauses | Live; server unlock and per-action confirmation required |
| Exact and regex allow/deny rules with explicit Pi-hole groups | Live add/remove; not a per-device rule unless Pi-hole group assignments make it so |
| Local A/AAAA host records | Live add/remove of one record at a time |
| Observed device inventory, manual IP/MAC selection, history and groups | Live five-second inventory; real group assignment with stale-edit protection |
| Lists, groups, configured client assignments | Live management in Super Pi Hole; no default policies overwrite existing settings |
| Windows/Microsoft and LG webOS privacy packs | Opt-in HaGeZi subscriptions with explicit Pi-hole groups and confirmation; run Update Gravity in original Pi-hole afterwards |
| DNS, DHCP, DNSSEC, NTP, resolver and database settings | Advanced JSON editor submits changed fields only; listener/auth/filesystem settings are deployment-managed |
| Gravity refresh | Live job with bounded output; no application-code update |
| Original Pi-hole interface | Read-only through authenticated Super Pi Hole in integrated mode |
| Administrator login and persistent app configuration | Standalone Node runtime; local SQLite and session cookies |
| Country selection, parental controls, schedules, category presets | **Saved policy simulations only; no live enforcement** |
| Blocklist catalog and pasted-list validator | Proposed presets and validation; no automatic feed ingestion |
| Connection/IP traffic history, bandwidth per device, gateway country blocking | **Not implemented**; requires gateway telemetry or a passive sensor |

DNS queries are not proof of website visits. Pi-hole cannot identify the person
using a shared device, application processes, full HTTPS URLs, messages, or
traffic that bypasses its resolver. Unknown destinations and foreign IPs are
not proof of spying.

## Upgrade an existing Pi-hole

The default `Dockerfile` and [TrueNAS upgrade YAML](deploy/truenas-upgrade.yaml)
build/run the integrated distribution. Three services (backup, DNS, GUI) use the
same reviewed GHCR image; no upstream Pi-hole image is pulled at runtime. Existing
configuration and dnsmasq directories are retained after a verified backup.

Use a versioned release and its image digest. Never run two engines on the same
port or data. The currently supported upgrade baseline is Pi-hole core 6.4.1,
FTL 6.6, web 6.5 (`pihole/pihole:2026.04.0`), Linux amd64. See
[the integrated installation guide](docs/INTEGRATED-UPGRADE.md).

## Legacy companion development

See [the installation guide](DEPLOYMENT.md) for three paths:

1. **Docker Compose from source:** use `deploy/Dockerfile.companion` for GUI-only development.
2. **TrueNAS SCALE YAML:** runs an uploaded, prebuilt runtime bundle using an
   official Node image. No unpublished custom image is required.
3. **Native Node.js 24:** runs the same standalone runtime without Docker.

These legacy companion paths leave the existing Pi-hole's DNS port, container, configuration, and
volumes alone. Live changes are locked by default. No country blocks or new
blocklist subscriptions are applied during installation.

For a non-destructive compatibility check, see [the upgrade path](UPGRADING.md).

## Build and test

Requires Node.js 24 and npm. Use `npm.cmd` in Windows PowerShell if execution
policy prevents the `npm.ps1` wrapper from running.

```sh
npm ci
npm test
npx tsc --noEmit
npm run build:server
npm run package:server
```

The standalone server serves the compiled UI and authenticated APIs without
Vite, npm, or third-party runtime packages. Set its environment as described
in the installation guide, then run `npm run start:server`.

`npm run dev` retains the existing loopback-only design preview. It does not
require a login and never permits live Pi-hole mutations. `npm run build`
retains the original framework build. `npm start` is the template's Cloudflare
preview and **does not run the complete standalone service**.

For isolated GUI development, build the standalone UI and run
`node tests/serve-fixture.mjs`. Its loopback-only synthetic server runs at
`http://127.0.0.1:3100` with password `local-fixture-only-password`. This password
is for fabricated test data only and must never be used for an installation.

## Security and privacy

- No cloud telemetry, remote analytics, packet recording, or automatic updates.
- Live DNS history remains in Pi-hole; this version reads it on demand, without
  copying it into the review database. Browser and server memory hold responses
  temporarily. Pi-hole's own privacy and retention settings still apply.
- Never expose this test interface directly to the Internet. Use a trusted
  management LAN and HTTPS for ongoing use. Plain HTTP does not encrypt passwords.
- Pi-hole credentials stay server-side. Use its application password when
  possible; some write/config operations need additional Pi-hole permission.
- The API has a fixed configured upstream and explicit operation allowlists,
  not an unrestricted URL proxy or command execution endpoint.
- Family-profile ownership, recovery flows, a durable administrative audit log,
  and production security review remain future work. One admin account is
  not complete family role-based authorization.

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

### Device telemetry presets

The Blocklists page explains the Windows/Microsoft and LG webOS packs. Install
them from **Live Pi-hole → Lists**, after explicitly unlocking server-side
writes and selecting existing device-specific Pi-hole groups. Neither is added
automatically to the balanced preset. A subscription is not a successful feed
download: use the original Pi-hole to update gravity and check its download
status. Existing subscriptions are never silently overwritten or reassigned.

These [HaGeZi native-tracker lists](https://github.com/hagezi/dns-blocklists)
are stricter than the native-tracker subset in the balanced tiers, can overlap
other lists, and may affect useful services. Test Windows updates, security,
sign-in and Office, or TV streaming, casting and firmware updates. Pair DNS
filtering with OS/TV privacy settings; it cannot guarantee that all telemetry
or automatic-content-recognition traffic is stopped. See also
[Microsoft's diagnostics guidance](https://learn.microsoft.com/en-us/windows/privacy/configure-windows-diagnostic-data-in-your-organization).

Charts show DNS counts, not bandwidth, visited URLs or family screen time.
Timestamps use the browser's local time zone and mark the centers of Pi-hole's
history buckets; interval drill-down includes both halves of that bucket. The chart window filters the
history returned by Pi-hole; summary cards and donut totals retain Pi-hole's
reporting window. Client identity may be hidden by DNS proxies or privacy
settings. A clickable chart interval filters the query log, whose retained
history can be shorter than the aggregate chart history.

## Roadmap

Priorities are authenticated server validation on real hardware, Pi-hole API
compatibility tests, safe policy-to-resolver integration, IPv6/DNS bypass
visibility, and optional passive traffic collectors. TrueNAS/Pi-hole remains
the first target; a replacement gateway is not required for the DNS companion.

The MIT license covers this project's original code, not the independent
upstream products or third-party blocklists.

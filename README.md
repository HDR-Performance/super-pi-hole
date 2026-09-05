# Super Pi Hole

An independent, self-hosted companion interface for **Pi-hole v6**, with a
family-policy design workspace. Open source so others can inspect, improve,
and build their own containers or TrueNAS installations.

**0.2.0-test is an early test release, not a production security appliance.**
It connects to an existing Pi-hole; it does not replace its DNS engine.
Pi-hole, TrueNAS, TP-Link, NETGEAR, and Ubiquiti do not sponsor or endorse it.

## What works

| Capability | Status |
| --- | --- |
| Live DNS statistics, top clients/domains, upstream performance | Pi-hole v6 API connector |
| Query log, domain/client/result filters, older-query pagination | Live, up to 100 requests per page |
| Enable blocking and timed pauses | Live; server unlock and per-action confirmation required |
| Exact and regex allow/deny rules with explicit Pi-hole groups | Live add/remove; not a per-device rule unless Pi-hole group assignments make it so |
| Local A/AAAA host records | Live add/remove of one record at a time |
| Lists, groups, configured client assignments | Live read-only views; edit in original Pi-hole |
| DHCP, CNAMEs, DNSSEC, gravity updates, Teleporter, diagnostics | Retained via original administration interface; not reimplemented |
| Administrator login and persistent app configuration | Standalone Node runtime; local SQLite and session cookies |
| Country selection, parental controls, schedules, category presets | **Saved policy simulations only; no live enforcement** |
| Blocklist catalog and pasted-list validator | Proposed presets and validation; no automatic feed ingestion |
| Connection/IP traffic history, bandwidth per device, gateway country blocking | **Not implemented**; requires gateway telemetry or a passive sensor |

DNS queries are not proof of website visits. Pi-hole cannot identify the person
using a shared device, application processes, full HTTPS URLs, messages, or
traffic that bypasses its resolver. Unknown destinations and foreign IPs are
not proof of spying.

## Install alongside an existing Pi-hole

See [the installation guide](DEPLOYMENT.md) for three paths:

1. **Docker Compose from source:** builds a self-contained container.
2. **TrueNAS SCALE YAML:** runs an uploaded, prebuilt runtime bundle using an
   official Node image. No unpublished custom image is required.
3. **Native Node.js 24:** runs the same standalone runtime without Docker.

All paths leave the existing Pi-hole's DNS port, container, configuration, and
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

## Roadmap

Priorities are authenticated server validation on real hardware, Pi-hole API
compatibility tests, safe policy-to-resolver integration, IPv6/DNS bypass
visibility, and optional passive traffic collectors. TrueNAS/Pi-hole remains
the first target; a replacement gateway is not required for the DNS companion.

The MIT license covers this project's original code, not the independent
upstream products or third-party blocklists.

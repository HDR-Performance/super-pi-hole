# Pi-hole reference and feature-parity register

## Compatibility rule

The official [Pi-hole project](https://github.com/pi-hole/pi-hole) is the upstream
reference, not merely visual inspiration. Super Pi Hole keeps the source-built
engine's behavior and data model, then presents its controls in our interface.
A clearer interface must not invent API semantics or label a simulation as DNS
enforcement. This does not imply every upstream screen has already been ported.

The reproducible reference is **core v6.4.1, FTL v6.6, web v6.5 and Docker
2026.04.0**, recorded with commits in `config/upstream-lock.json`. Complete
snapshots and licenses are under `vendor/pi-hole/`. Do not silently track upstream
`master`, pull upstream application updates on startup, or replace the DNS engine
with a mock in a distributable image.

For API behavior, consult `vendor/pi-hole/ftl/src/api/docs/content/specs/` and the
corresponding C implementation. For stock UI coverage, consult
`vendor/pi-hole/web/scripts/lua/sidebar.lp` and the stock settings pages.
[Pi-hole's CLI documentation](https://docs.pi-hole.net/main/pihole-command/) and
[configuration reference](https://docs.pi-hole.net/ftldns/configfile/) supplement
those pinned sources. The supplied [Wikipedia overview](https://en.wikipedia.org/wiki/Pi-hole)
is useful background, not a versioned API contract; historical PHP/lighttpd
descriptions are not an implementation guide for the bundled v6 engine.

## Development source versus published installation

This register describes the **0.4.0-test source**.
The older 0.3.0-test image does not contain these new editors, history views,
or the original-viewer authentication fix. Rebuilding a local preview does not
upgrade an installed TrueNAS app. No real DHCP, DNS, list, password or router
settings were changed to test this work.

| Pi-hole capability | Super Pi Hole location | Development status |
| --- | --- | --- |
| Query totals, blocked totals, percentage, list size, top domains/clients | Live Pi-hole / Dashboard | Existing real API reads, no fabricated fallback counts |
| Query/client timelines, upstream and record-type charts | Dashboard | Existing charts retained; interactive filtering and series controls |
| Disable temporarily or indefinitely, resume | Dashboard / DNS blocking | Short presets, custom 1 second–24 hours, indefinite and countdown; FTL owns the timer |
| Query log, pagination, domain/client/result/type filters | Query log | Existing; now also dates, stored-database source, client hostname, reply, query status and DNSSEC filters, plus optional five-second follow for recent queries |
| Long-term graphs and statistics | Long-term history | New stored-database summary, charts, top domains/clients and query drill-down; bounded to 366 days per request |
| Exact/regex allow and deny rules | Domain rules | Add/remove retained; new editing of action, enabled state, comments and named group selection; hostname/match kind stay fixed during an edit |
| Filtering groups | Groups | New direct create/edit/delete form; default group deletion prevented |
| Allow/block subscriptions | Lists | New direct create/edit/enable/disable/delete form, named groups and Gravity control; currently HTTPS URLs only |
| Configured clients | Client assignments | New create/edit/delete form: IP, CIDR, MAC, hostname and `:interface`, with named group selection |
| Observed network devices, per-device queries and groups | Devices | Existing FTL device inventory; not a guarantee that every LAN device is visible |
| Local host records | Local DNS; Settings & tools | Existing individual add/remove plus engine-array editor for multi-name records |
| CNAME records | Settings & tools / Everyday controls | Engine metadata-backed CNAME list editor, one native-format entry per line |
| Upstream DNS, DNSSEC, cache, blocking behavior, reverse forwarding, rate limits | Settings & tools | New typed fields and supported choices read from the connected engine |
| DHCP ranges, router, IPv6, static leases | Settings & tools | New typed fields and native-format reservations editor; enabling DHCP requires explicit competing-server acknowledgement |
| DHCP lease inspection/removal | Diagnostics & tools | New exact-record removal with stale-edit protection; not router lease management |
| Privacy level and database retention | Settings & tools | New privacy/retention controls; real metadata, not a local preference pretending to affect FTL |
| Resolver and NTP settings | All engine controls | New metadata-backed controls, with installation-protected fields excluded |
| Pi-hole diagnosis, interfaces, routes and gateway | Diagnostics & tools | New partial-failure-aware readouts; plain diagnostic messages can be dismissed |
| FTL, dnsmasq and web server logs | Diagnostics & tools | New last-300-entry view and optional five-second follow; log credential-marker redaction is best effort, not a sharing guarantee |
| Search domain rules and subscribed lists | Diagnostics & tools | New exact/partial search; list matches are not themselves per-device effective verdicts |
| Gravity refresh | Lists; Advanced manager | Existing streamed job retained; downloads list data, not application code |
| Restart DNS, clear logs/network/ARP data | Diagnostics & tools / Maintenance | New exact-operation acknowledgement and confirmation; operations can be disruptive or destructive |
| Teleporter export | Backups | Existing download retained; not a full DNS-history/dataset backup |
| Teleporter restore | — | **Still missing.** Must support validated, selective import without overwriting integrated listeners/authentication; no unrestricted archive replay |
| Stock UI access | Open original Pi-hole administration | Read-only proxy retained. Development fix forwards engine authentication server-side; pinned-container/browser validation still required |
| Web/API authentication, listener ports, file paths, process privileges | TrueNAS / deployment configuration | Deliberately deployment-managed, not freely editable through DNS forms |
| Pi-hole application self-update | Super Pi Hole versioned releases | Deliberately replaced with maintainer-reviewed source/container releases |

## Still to complete or simplify

- Comprehensive browser and real-device/DHCP acceptance remains required for
  production readiness. Prerelease publication requires the source-built-container
  tests; unit and synthetic-runtime tests alone do not establish DNS correctness.
- Safe selective Teleporter import with a verified pre-change backup and rollback.
- Friendlier CNAME, reverse-forwarding and DHCP-reservation row editors. Their
  native-format array controls already expose the underlying settings.
- Bulk rule operations, match-kind migration, and reviewable support for existing
  non-HTTPS subscription sources. Do not drop those upstream capabilities from the
  long-term parity target just because the first safe editor is narrower.
- Full stock-viewer browser compatibility and controller-specific account/session
  settings. Protect the integrated listener and credentials throughout this work.

The new live family controller adds group-based social/domain schedules separately
from the original simulator; see [the twelve-feature checklist](FAMILY-NETWORK-FEATURES.md).
Country policies, parental categories, SafeSearch simulations and custom
block-page media are **not** made live by these additions.
Their enforcement is a separate implementation track. DNS-only filtering cannot
provide full URLs, application process identification, complete network-flow
monitoring, or universal HTTPS redirection.

## Regression gates

1. Preserve `config/upstream-lock.json` until an explicit upstream review changes it.
2. Verify operations against the pinned OpenAPI spec and implementation, not just
   a mock. `tests/upstream-reference.test.mjs` checks documented routes/methods and
   server-side stock-page authentication isolation.
3. Run `npm test`, `npx tsc --noEmit`, targeted lint and `npm run build:server`.
4. Exercise edits, cancel/confirm, stale data, read-only mode, missing data and timer
   expiry in the browser. All local preview data must remain explicitly synthetic.
5. Build and test the integrated image with the pinned engine. Verify DNS answers,
   disabled/enabled and timed states, durable settings, restart recovery, stock
   viewer and read-only restrictions before tagging a release.
6. Publish a new immutable version/digest and upgrade YAML only after those gates.
   Preserve existing DNS datasets and backups; never reset a working installation
   merely to make it resemble a new demonstration build.

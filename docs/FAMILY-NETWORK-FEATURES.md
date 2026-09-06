# Family and network feature acceptance checklist

0.4.1-test feature scope, September 5, 2026. Publishing source does not itself
upgrade an installed NAS. No new gateway authority is assumed: the selected
deployment remains TrueNAS/Pi-hole now, gateway integration later.

## Requested features

| # | Requirement | Current development implementation / remaining gate |
|---|---|---|
| 1 | Country checkbox blocking with alerts | Complete country selector remains a simulator. No live GeoIP/firewall enforcement. |
| 2 | Device destination history; allow/block | FTL-observed device inventory, per-IP query log, confirmed native domain rules. DNS names are not full URLs or proof of visits. |
| 3 | Group website/social schedules | **New:** server-owned 30-second scheduler writes native group-scoped regex deny rules. Time zones, weekday/overnight windows, access windows. Test actual DNS in pinned container before release. |
| 4 | Incoming country activity with quick block | Unavailable without direction-aware router/firewall flow telemetry. Never infer incoming traffic from DNS questions. |
| 5 | US-only connections switch | Visible but disabled without a gateway connector. A separate button prepares a US-only simulator policy, including unknown locations. This does not enforce network isolation. |
| 6 | Custom block page, media and redirects | Not implemented in this slice. Needs a safe page/media service (200 MB/file limit, content validation) and separately tested HTTP integration. DNS does not change URL schemes/ports or provide valid certificates for blocked HTTPS sites. Universal HTTP/HTTPS redirection is not promised. |
| 7 | Device assignment to family groups | Existing native group assignment from Devices; **new:** register that same dedicated group as a live family profile. Default group cannot be registered. |
| 8 | Notifications; detail one month, traffic year | **New:** persistent family changes/failures/conflicts, unread/acknowledge, 0–30-day detail retention, up to 365 daily change/error aggregates. These are control events, not traffic totals. FTL query/system-log retention and yearly traffic aggregation remain separate work. |
| 9 | Active devices with byte totals | **New:** recent-DNS badge (5 minutes); not proof of online status. Byte totals explicitly unavailable, awaiting flow telemetry. |
| 10 | Family-wide Internet shutdown | **New:** confirmed family-wide DNS catch-all for registered groups. Not a full traffic cutoff: allowlists, existing connections, direct IP, VPN and external DNS remain limitations. Gateway kill switch remains pending. |
| 11 | Child queries and site inspection links | **New:** assigned-client history under family profiles; explicit external HTTPS inspection links in Query Log, hostname validation, confirmation, no opener/referrer. No automatic fetching. MAC/hostname assignments require an observed IP. |
| 12 | Individual social switches in family and lists | **New:** same persisted controls in Parental Controls, Blocklists and Schedules for Facebook, Snapchat, Instagram, Reddit, YouTube, Discord, X, TikTok and Twitch. Compact suffix catalog only; not every platform/region or bypass-proof app filtering. |

## Safety and control ownership

- Profiles attach to existing enabled Pi-hole groups. They do not rewrite clients,
  global DNS blocking, DNS ports, DHCP, application passwords or existing lists.
- New rules carry the `Super Pi Hole family v1: ` comment prefix. The controller
  only modifies its own rules. Matching unowned rules produce a conflict; they
  are never silently adopted or deleted.
- The GUI owns the desired state for these managed rules. Manual edits produce
  an attention notification and stop automatic writes. Recovery requires an
  explicit review/reconciliation confirmation. Non-owned settings remain native.
- “Off” removes only the corresponding managed block. An access window means
  absence of this block during that window, not a forced allow. Other active
  schedules/permanent blocks can still deny the service. Pi-hole allowlist
  precedence is preserved, including for the DNS catch-all.
- The scheduler operates on the server, every 30 seconds and at startup. A rule
  change can take longer to affect a client due to its DNS/application cache.
  If the controller stops, Pi-hole retains the last rules. Startup reconciles a
  previously verified state; interrupted/uncertain writes stop for review.
- Multi-rule changes are not an atomic engine transaction. Progress is marked
  `applying` durably before writes. Partial failure is `attention`, not success;
  no automatic replay follows an unknown result.
- Notifications live in `review.sqlite.family.sqlite` alongside the existing
  app database on its persistent volume. Back up the whole app data volume using
  an application-consistent snapshot; copying only `review.sqlite` is insufficient.
  Original Pi-hole Teleporter exports do not include controller profiles/schedules.
- No detail/byte telemetry is invented. Country and family simulators remain
  available in explicitly labeled secondary sections, not presented as live.

## Domain catalog sources and maintenance

`lib/family-dns.mjs` is a compact, maintainer-reviewed collection of hostname
facts, not an imported third-party rule engine or an exhaustive service list.
Cross-check service domains with the primary [AdGuard HostlistsRegistry service
catalog](https://github.com/AdguardTeam/HostlistsRegistry/tree/main/services),
including its [Facebook](https://github.com/AdguardTeam/HostlistsRegistry/blob/main/services/facebook.yml),
[Instagram](https://github.com/AdguardTeam/HostlistsRegistry/blob/main/services/instagram.yml),
[YouTube](https://github.com/AdguardTeam/HostlistsRegistry/blob/main/services/youtube.yml)
and [TikTok](https://github.com/AdguardTeam/HostlistsRegistry/blob/main/services/tiktok.yml)
data. No downloaded rule updates run at startup. Shared/CDN domain consequences
are shown before selection. Regional aliases and newly introduced endpoints need
continued maintainer review and real-device testing; do not advertise completeness.

The native behavior remains grounded in the pinned FTL OpenAPI and implementation
under `vendor/pi-hole/ftl`, not the simulator. See [Pi-hole group management](https://docs.pi-hole.net/group_management/example/)
and [blocking modes](https://docs.pi-hole.net/ftldns/blockingmode/).

## Remaining release gates

1. Browser exercise of registering/unregistering groups, device histories, changes
   shared between tabs, schedules, cancel/confirm, read-only and failure states.
2. Build pinned engine container and test actual A/AAAA DNS requests from assigned
   clients, IP/MAC precedence, explicit allowlist bypass, overnight/timezone timing,
   controller restart and partial failures. Synthetic API tests are not DNS tests.
3. Verify data-volume backup/restore includes the new family database and its WAL.
4. Publish a new immutable image and upgrade YAML only after these gates. Never
   retag the previously published 0.3.0-test artifact to disguise these changes.

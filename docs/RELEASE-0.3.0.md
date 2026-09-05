# Super Pi Hole 0.3.0-test

Integrated Linux amd64 test release: source-built FTL 6.6, Pi-hole core 6.4.1,
web UI 6.5, and Super Pi Hole in one versioned GHCR image. TrueNAS runs separate
DNS and controller services from that image. No upstream application downloads,
Pi-hole updater, or branch tracking occurs at runtime. Gravity/blocklist refresh
is data maintenance and remains available.

The upgrade YAML reuses both existing Pi-hole directories and first creates a
checksummed backup with the original directories mounted read-only. It refuses
missing v6 configuration/gravity data and an occupied DNS port. This is an
upgrade of an existing v6 installation, not a blank-dataset installer.

The engine API/stock UI listens on NAS loopback only. Authenticated Super Pi Hole
owns browser writes; its original-UI link opens a read-only viewer. NAS root and
other trusted host processes remain outside this browser authorization boundary.
Existing Pi-hole credentials, groups, lists and settings are retained; the web
listener moves from LAN port 20720 to loopback 20720. The main UI stays on 20721.

The dashboard refreshes every five seconds by default. Record creation now
works over LAN HTTP without secure-context-only browser APIs.

Important scope: country, family and schedule policy-lab simulations are not
automatically deployed to DNS. DNS observations are requested domains, not
proof of visited pages or a complete network scan. Universal HTTPS block-page
redirects cannot be implemented using DNS alone. No live household data was
used in CI; test fixtures do not establish a successful NAS migration.

## Upgrade

Read `docs/INTEGRATED-UPGRADE.md`, save the old YAML, stop the old companion on
20721, and replace the existing `pihole` app YAML with the release asset. Set a
unique Super Pi Hole administrator password before saving. Never delete the old
Pi-hole app/data to perform this upgrade. Do not point a second DNS container at
the same live directories. Back up/snapshot the datasets independently first.

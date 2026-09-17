# Super Pi Hole 0.4.4-test

This testing prerelease fixes independent social-platform controls and improves controller startup resilience on NAS storage.

Allowing a platform now removes only Super Pi Hole's owned deny rule and installs a narrowly scoped, owned allow rule for that platform. This prevents an enabled Facebook rule or a broad curated gravity list from continuing to block Instagram through shared Meta hostnames. Blocking the platform again removes that owned allow rule before restoring the deny rule. User-created domain rules are never silently replaced.

The controller's SQLite stores now use WAL with normal synchronous durability, and the initial family-policy reconciliation is delayed briefly so health checks and the web interface can become available before storage-backed background work begins. These changes reduce false startup failures on slower TrueNAS datasets without weakening DNS filtering or changing existing Pi-hole data mounts.

Fresh integrated installations disable Pi-hole's embedded IPv4/IPv6 NTP listeners because the NAS host already owns port 123, and seed a bounded `dns-forward-max=300` setting for short household DNS bursts. Existing installations retain their current settings. The health endpoint now reports the package version instead of a stale hard-coded value.

The release retains the complete Pi-hole engine, network-wide blocklist presets, social switches, family groups and schedules, privacy packs, notifications, Super Lan-Cache integration, no-login option for trusted local networks, and the original Pi-hole administration viewer. DNS filtering cannot inspect encrypted payloads, stop direct-IP traffic, or reliably remove ads served from the same hostnames as wanted content.

This remains a testing prerelease. Preserve existing data mounts and credentials, take a snapshot before updating, keep the previous image digest for rollback, and allow a short DNS maintenance window. Use the release's digest-pinned YAML matching the installation layout.

# Super Pi Hole 0.4.2-test

Notification maintenance and independent Pi-hole API health monitoring.

- Clear individual or displayed notifications without clearing Pi-hole logs or active health issues.
- Read-only checks run every 30 seconds without requiring family profiles. Authentication failures, unavailable or incompatible APIs, disabled blocking and native diagnostic message counts are surfaced in Notifications.
- Repeated identical health issues are suppressed; recovery is reported. Active issues remain visible after history is cleared.
- Notification identifiers are not reused after clearing, protecting new events from stale browser requests.
- Regression coverage includes clearing, recovery, malformed responses and credential sanitization. The complete local suite passed 144 tests and the standalone GUI build passed.

This is a testing prerelease. API checks are not end-to-end DNS tests or complete network monitoring. Existing retention settings apply. Native diagnostic details remain under Settings & tools. Existing family conflicts still require deliberate reconciliation.

Use the release's digest-pinned YAML for the matching installation layout. Preserve existing data mounts and credentials, snapshot before updating, and allow a DNS maintenance window. Do not substitute a fresh-install template for an existing installation. No automatic production upgrade is performed by publishing this release.

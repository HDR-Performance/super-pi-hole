# Super Pi Hole 0.4.3-test

This testing prerelease makes optional device privacy packs complete and auditable.

The Windows telemetry switch now combines its curated subscription with the exact `settings-win.data.microsoft.com` rule needed for the Windows settings endpoint. Super Pi Hole records ownership on the supplemental rule, refuses to replace an overlapping user-created rule, verifies group coverage, and reports when an enabled pack needs repair. Turning the pack off removes only the rule and subscription owned by Super Pi Hole.

The release retains the independent Super Lan-Cache connection, notification health checks, family controls, no-login option for trusted local networks, and separate operation of both applications. The complete local suite passed 146 tests, the standalone UI build passed, and the integrated server build was exercised on TrueNAS before publication.

Cloudflare development tooling is updated to the current patch releases, and the transitive image library is pinned to `sharp` 0.35.4 to clear the published libheif security advisory. The release dependency audit reports zero known vulnerabilities.

This remains a testing prerelease. DNS filtering cannot inspect encrypted payloads or reliably remove advertising served from the same hostnames as wanted content. Preserve existing data mounts and credentials, take a snapshot before updating, and allow a short DNS maintenance window. Use the release's digest-pinned YAML that matches the existing or fresh-install layout.

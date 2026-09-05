# Contributing

Use Node 24 and the committed lockfile. Run `npm ci`, `npm test`,
`npx tsc --noEmit`, and `npm run build:server` before submitting a pull request.
The test fixture uses only documentation IPs and `.example` domains.

Keep changes bounded and add regression tests. Preserve existing Pi-hole
configuration unless an administrator confirms an exact live action. Never
test a mutation against a contributor's production DNS server by default.

Keep simulation and live data visibly separate. A DNS request is not a visited
page, a country match is not evidence of spying, and a passive sensor cannot
block a connection. Do not substitute sample data when a real connector fails.

Include reproduction steps, API/FTL version, and synthetic data. Do not submit
live logs, credentials, databases, private exports, or personal infrastructure
inventories. New resolver/gateway integrations require an explicit threat model,
coverage limitations, reversible deployment, and tests.

By submitting original code, you agree to license your contribution under this
repository's MIT license. Preserve the notices and licenses of third-party code.

# Optional LanCache integration

Super Pi Hole and LanCache remain independent applications. Super Pi Hole starts,
filters DNS, and exposes its normal interface when LanCache is absent, disabled, or
unreachable. Pairing is an optional local-network convenience.

## Peer API contract

The LanCache management service must expose these authenticated, read-only routes:

- `GET /api/integrations/v1/identity`
- `GET /api/integrations/v1/status`
- `GET /api/integrations/v1/services`

Requests use `Authorization: Bearer <pairing-token>`. Super Pi Hole accepts an
explicit private IP-literal HTTP(S) management origin and rejects redirects, public
addresses, credentials, paths, query strings, fragments, oversized responses, and
invalid schemas.

Identity must report API version `1`, product `lancache`, a stable instance ID, and
the capabilities `status.read` and `services.read`. Status supplies the cache-content
addresses; the management URL is never reused as a content address. Services supplies
a revisioned catalog of exact and wildcard DNS domains.

## DNS control and recovery

Enabling or testing the integration never changes DNS. The administrator selects
services, previews the exact route changes, and separately confirms an apply. Super
Pi Hole writes through Pi-hole's `misc.dnsmasq_lines` API, verifies the readback, and
records its exact owned lines. Restore removes only those owned lines. Conflicts,
configuration drift, stale previews, changed peer identities, or unconfirmed writes
stop the operation and preserve recovery state for inspection.

The pairing token is encrypted at rest with a separate local key, is masked in API
responses, and can be revoked. Preserve the integration database and its matching key
during backups and restores.

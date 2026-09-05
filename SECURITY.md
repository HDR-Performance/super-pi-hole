# Security policy

This is an experimental LAN management application. No claim of a security
audit, penetration test, child-proof filtering, or complete traffic visibility
is made. Treat the administrator account as access to sensitive DNS history.

Use a private management network and HTTPS. Do not forward this application to
the Internet. The HTTP examples are for isolated LAN evaluation, not encrypted
transport. Use unique passwords and keep live writes locked when not needed.

Never post passwords, API sessions, Teleporter archives, database files, family
profiles, MAC addresses, or real query logs in public issues. Prefer a synthetic
reproduction. Use GitHub private vulnerability reporting when available; if it
is not available, open an issue requesting a private contact without disclosing
exploit details or personal data.

Sessions expire after eight hours, are revoked on logout, and are invalidated
by a server restart. Login attempts are rate-limited. These controls are an
initial baseline, not a substitute for network isolation or a future audit.

The app's read-only setting is an application-enforced restriction, not a promise
that a Pi-hole application password has server-enforced read-only permissions.
Protect that upstream credential accordingly. Administrators can configure an
upstream URL; ordinary API requests cannot select arbitrary destination hosts.

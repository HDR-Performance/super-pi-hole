# Third-party notices

Super Pi Hole is an independent distribution, not an official Pi-hole product.
The integrated release vendors unmodified Pi-hole core v6.4.1, FTL v6.6, web
v6.5 and Docker packaging 2026.04.0 in `vendor/pi-hole/`. Exact Git commits,
original file hashes and provenance are recorded beside each source tree and in
`config/upstream-lock.json`. Their EUPL-1.2 licenses, copyright notices and
embedded dependency licenses (including dnsmasq's GPL terms) remain in place.
Our MIT license does not replace these licenses. The complete vendored sources
also ship in the container at `/app/upstream-source`. Packaging changes live
separately under `deploy/`; no upstream source file is patched by our build.
Pi-hole's name and trademarks remain their owners'. No GeoIP database, family
query history, customer configuration, or downloaded blocklist data is bundled.

- Pi-hole: https://github.com/pi-hole/pi-hole
- Pi-hole FTL API documentation: https://docs.pi-hole.net/api/
- API contract reference for this release:
  https://github.com/pi-hole/FTL/tree/v6.6/src/api/docs/content/specs
- React, Vite, Vinext, Tailwind CSS, Base UI/shadcn, Lucide, and other dependencies
  retain their respective licenses. The committed npm lockfile records versions.
- Country names/codes use the platform's ICU/CLDR internationalization data.
- Blocklist source URLs, purposes, and declared licenses are recorded in
  `config/blocklist-presets.json`. No downloaded list contents are bundled.
  Subscription/use and redistribution terms can differ; check each upstream.

The release packager includes installed dependency LICENSE/NOTICE/COPYING files
under `third-party-licenses/`. The original application code is MIT licensed;
that does not relicense the dependencies or the linked upstream products.

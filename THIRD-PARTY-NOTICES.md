# Third-party notices

Super Pi Hole is an independent companion to Pi-hole. This repository does not
vendor or redistribute Pi-hole core, FTL, its web interface, or a GeoIP database.
The original project's licenses and trademarks remain its own. Inspect upstream
licenses before bundling any of those components in a derivative distribution.

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

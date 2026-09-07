# Super Pi Hole 0.4.1-test

Integrated DNS engine and controller, with the working family controls, network editors, source-built Pi-hole startup fixes, and optional Super Lan-Cache setup.

- Paste a unique Super Lan-Cache setup code, select Steam / PC gaming / all supported services, review the DNS preview and apply it. Existing selections are preserved; links are optional and both apps run independently.
- Live family DNS rules, network policy controls, client identity handling and opt-in privacy presets are retained.
- Fresh-volume initialization creates Gravity data correctly. Upstream MAC vendor data is included with a verified checksum.
- Container asset permissions allow the UID 568 controller to serve its JavaScript, CSS and new icon.
- Distinct Super Pi Hole SVG and 512px PNG icons, plus a portable fresh TrueNAS installer with a Web UI portal and image digest.
- The fresh trusted-LAN template enables no-login mode explicitly; password protection remains available through deployment settings. The Pi-hole API listens on loopback port 20720.

Use `super-pi-hole-truenas-fresh.yaml` for a new installation and follow docs/TRUENAS-INSTALL.md. Edit the example LAN address and dataset paths first. Existing installations should preserve their own mounts and credentials; legacy upgrade assets are for their documented layouts only. Snapshot data and plan a DNS maintenance window before updates.

Automated release gates build the full engine from source and exercise DNS, retained rules, controller writes, family controls, backup/restore paths, restart persistence and actual web asset delivery. This remains a testing prerelease. Country firewall enforcement, per-device bandwidth and universal HTTPS block pages are not implemented. Neither app has been accepted into the official TrueNAS Community catalog.

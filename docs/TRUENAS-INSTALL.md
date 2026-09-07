# Super Pi Hole on TrueNAS

1. Download `super-pi-hole-truenas-fresh.yaml` from the [release](https://github.com/HDR-Performance/super-pi-hole/releases). It uses the tested image digest. The source template is `deploy/truenas-fresh-all-in-one.yaml`.
2. Replace every `192.168.1.10` and `/mnt/tank/apps/super-pi-hole` with your server address and dataset root. Create `pihole-config`, `dnsmasq` and `data` datasets. Give the controller data dataset owner UID/GID **568:568** with read/write/traverse permission. The DNS engine initializes its configuration datasets as root.
3. Ensure TCP/UDP 53 and TCP 20721 are available. One TrueNAS app runs two services from the same integrated image: the DNS engine and its controller. The original Pi-hole API listens only on loopback port 20720. No separate Pi-hole installation or Super Lan-Cache is required.
4. Install via YAML with name `super-pi-hole`, open **Web UI**, and check engine health before making clients use this server for DNS. Configure your router DHCP DNS address to this server's LAN IP when ready. Existing clients may need lease renewal. IPv6 DNS and encrypted-DNS/VPN clients need equivalent routing choices.
5. This fresh trusted-LAN template explicitly enables no-login mode. For password protection, set `SUPER_PIHOLE_AUTH_DISABLED: 'false'` and add a unique `SUPER_PIHOLE_PASSWORD` of at least 16 characters to the controller environment. Keep management port 20721 on your trusted network.

## Optional Super Lan-Cache

In [Super Lan-Cache](https://github.com/HDR-Performance/super-lan-cache), open Settings and create a setup code. Open Super Pi Hole at `#lancache`, paste it, select Steam, PC gaming or All supported services, and choose **Connect & prepare preset**. Review and apply the DNS preview. Existing service selections are preserved. The code contains the actual management address, so separate servers on the LAN work too; private-IP origins are currently required. Either app operates independently when pairing is disabled. See [quick setup](lancache-quick-setup.md).

## Existing installations and rollback

Do not apply the fresh template over existing data without matching every mount. Reuse your current app definition and change only the version/digest after reviewing release notes. Snapshot Pi-hole configuration and the entire controller data directory, including pairing keys and SQLite sidecar files. Keep the old image digest and configuration for rollback. App updates can briefly restart DNS; use a maintenance window. Legacy specialized templates are retained for documented migrations, not as generic fresh-install defaults.

## Current TrueNAS installation model

TrueNAS 24.10 and later use Docker Compose. These packages target **TrueNAS 25.10 on x86-64**, matching the validated server. Older Kubernetes / Manage Catalogs / Add Catalog guides do not describe this installation route.

Use **Apps → Discover Apps → ⋮ → Install via YAML**. The app appears in Installed Applications and `x-portals` provides its **Web UI** button. No SSH helper or Docker socket is required by either application.

App icons are provided as editable SVG and 512px PNG under `branding/`, and are used in each application's web interface. TrueNAS's custom YAML editor has no supported icon field; a generic icon there does not mean installation failed. Do not patch NAS internal metadata files. For an official catalog icon and guided installation form, contribute a definition under `ix-dev/community/<app-name>` in `truenas/apps`: `app.yaml`, `ix_values.yaml`, `questions.yaml`, and rendered Compose templates. Reviewers arrange CDN hosting for icons. These repositories are application source releases, not an already accepted Community catalog. No upstream submission or catalog acceptance is claimed.

References: [TrueNAS 25.10 custom apps](https://www.truenas.com/docs/scale/25.10/scaleuireference/apps/installcustomappscreens/), [current contribution layout and icon requirements](https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md).

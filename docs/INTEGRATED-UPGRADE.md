# Integrated TrueNAS upgrade

Use only a published release whose **Integrated DNS release** workflow passed.
Use the correct integrated release asset, not the older companion templates.
The existing one-app external-volume installation uses
`super-pi-hole-existing-app-upgrade.yaml` (source: `deploy/truenas-existing-app.yaml`).
The original-Pi-hole dataset migration uses `super-pi-hole-truenas-upgrade.yaml`
(source: `deploy/truenas-upgrade.yaml`). Never interchange their GUI data mounts.
The attached `image-digest.txt` identifies the tested image. For immutable
installation, replace all three image values with that `ghcr.io/...@sha256:...`
reference. TrueNAS pulls that image from our GHCR project; it does not clone
upstream Pi-hole or run `pihole -up`.

1. Save the working original YAML and export a Pi-hole Teleporter backup. Take
   a TrueNAS snapshot of the Pi-hole config and new app datasets. Keep private
   data and credentials out of GitHub.
2. Stop the old standalone Super Pi Hole companion, which occupies 20721.
   Stop the original Pi-hole app before editing its YAML. This is a planned DNS
   outage; choose a maintenance window. Do not delete the app or its data.
3. Edit the existing `pihole` app YAML. Paste the release upgrade YAML. It targets
   `/mnt/.ix-apps/app_mounts/pihole/config`, the sibling `dnsmasq` directory,
   and the actual existing GUI data. The external-volume template retains
   `ix-super-pi-hole_super-pi-hole-data` and uses the app's `upgrade-backups`
   volume. The dataset template instead uses
   `/mnt/M1.1/APPS/Super-Pi-Hole/{data,backups}`. Verify paths/case before saving.
4. Preserve your current `SUPER_PIHOLE_PASSWORD` (16–256 characters). Set
   `PIHOLE_PASSWORD` to the existing Pi-hole API password (blank in the supplied
   baseline). The engine does not replace its existing password.
5. Start the app. Backup must succeed before DNS starts. The Web UI button opens
   `http://192.168.0.8:20721/`. Sign in there; its original UI link opens `/admin/`
   read-only in a new tab. Do not expose these HTTP ports to the Internet.
6. Check existing lists, groups, clients, local DNS and upstream DNS. Test one
   client using this DNS directly: an allowed local domain and a known blocked
   test domain. Verify per-client query history before changing router-wide DNS.
   Check IPv6 DNS and encrypted DNS/VPN bypass separately.

The automatic backup reads the original directories and the complete controller
data directory, including SQLite/WAL files. Stop both services before copying.
It verifies file hashes and refuses detected source changes. It does not change
the original directory contents.
Starting FTL subsequently updates normal runtime files, schema if required,
ownership (as stock Pi-hole does), and its loopback web-listener configuration.
It does not clear gravity, queries, device rules, or replace configured lists.
Snapshots also preserve ACLs; the application backup verifies file contents but
is not a replacement for a TrueNAS snapshot/ACL backup. Backup copies are private
and retained without automatic pruning; monitor disk space.

## Rollback

Stop the integrated app before restoring anything. To undo 0.4.1-test managed
family rules, restore BOTH Pi-hole and controller data from the matching backup;
reverting only the image does not remove newly saved engine rules. Restore directories
from the pre-upgrade TrueNAS snapshots (preferred), or the verified backup's
`config` and `dnsmasq` copies, retaining permissions. Restore the saved original
YAML (the prior integrated image for an integrated rollback, or
`pihole/pihole:2026.04.0` with LAN web port 20720 for an original-Pi-hole rollback). Start only that
engine and verify DNS before restarting any separate companion. Never restore a
database while either engine is running. Do not assume an older engine can open
a future version's migrated database without restoring the matching snapshot.

## Maintainer updates

Import reviewed exact upstream commits with `tools/vendor-upstream.mjs` into a
separately reviewed source tree, preserve licenses, verify hashes, run unit and
real-container DNS/migration tests, then publish a new versioned release. The
release workflow publishes only after tests pass. Existing tags are not reused.
Users opt into the new image/YAML; there is no surprise automatic DNS restart.
Security updates still require maintainer review; a pinned baseline is not a
promise that it remains free of vulnerabilities indefinitely.

#!/bin/bash
# Super Pi Hole startup integration. Vendored upstream sources stay unmodified.
set -e
export PATH="/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export FTLCONF_webserver_port="127.0.0.1:20720"
export DNSMASQ_USER=pihole
source /usr/bin/bash_functions.sh
if [[ -f /etc/pihole/setupVars.conf && ! -f /etc/pihole/pihole.toml ]]; then
  echo 'Migrate v5 to supported Pi-hole v6 first; this release upgrades v6 only.' >&2
  exit 1
fi
# Apply explicit FTLCONF values and create pihole.toml on a fresh volume.
set_uid_gid
ftl_config
install_logrotate
gravityDBfile=$(getFTLConfigValue files.gravity)
if [[ ! -f "$gravityDBfile" ]]; then
  echo 'Fresh Pi-hole data directory detected; creating the initial gravity database.'
  migrate_gravity
else
  source /etc/.pihole/advanced/Scripts/database_migration/gravity-db.sh
  upgrade_gravityDB "$gravityDBfile" /etc/pihole
fi
fix_capabilities
sh /opt/pihole/pihole-FTL-prestart.sh
cat /app/config/pihole-versions > /etc/pihole/versions
start_cron
stop() {
  trap - TERM INT
  killall -15 pihole-FTL 2>/dev/null || true
  wait "$engine" || true
  sh /opt/pihole/pihole-FTL-poststop.sh
}
trap stop TERM INT
capsh --user=pihole --keep=1 -- -c '/usr/bin/pihole-FTL no-daemon' &
engine=$!
wait "$engine"

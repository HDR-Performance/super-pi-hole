#!/usr/bin/env bash
set -euo pipefail
image=${1:-super-pi-hole:ci}
docker volume create sph-ci-engine >/dev/null
docker run --rm -i --user 0:0 -v sph-ci-engine:/etc/pihole "$image" bash -es <<'SEED'
  pihole-FTL --config dns.upstreams "[\"1.1.1.1\"]" >/dev/null
  pihole-FTL --config dns.hosts "[\"192.0.2.42 allowed.test\"]" >/dev/null
  pihole-FTL --config dns.listeningMode ALL >/dev/null
  pihole-FTL --config webserver.api.password "" >/dev/null
  pihole-FTL --config ntp.ipv4.active false >/dev/null
  pihole-FTL --config ntp.ipv6.active false >/dev/null
  pihole-FTL --config ntp.sync.active false >/dev/null
  pihole-FTL sqlite3 /etc/pihole/gravity.db < /etc/.pihole/advanced/Templates/gravity.db.sql
  pihole-FTL sqlite3 /etc/pihole/gravity.db "INSERT INTO domainlist(type,domain,comment) VALUES(1,'blocked.test','preserved fixture rule');"
SEED
docker run --rm --user 0:0 --read-only --cap-drop ALL --cap-add CHOWN --cap-add FOWNER --cap-add DAC_READ_SEARCH --cap-add NET_BIND_SERVICE \
  -e SUPER_PIHOLE_PASSWORD=ci-only-long-test-password -v sph-ci-engine:/source/config:ro \
  -v sph-ci-dnsmasq:/source/dnsmasq:ro -v sph-ci-backups:/backups -v sph-ci-ui-data:/data \
  "$image" node /app/deploy/backup-upgrade.mjs
docker run -d --name sph-ci-dns --user 0:0 --cap-add NET_ADMIN --cap-add SYS_NICE --cap-add SYS_TIME \
  -v sph-ci-engine:/etc/pihole -p 127.0.0.1:20721:20721 "$image" bash /app/deploy/start-dns.sh
trap 'docker logs sph-ci-dns; docker logs sph-ci-ui 2>/dev/null || true' ERR
for i in $(seq 1 60); do
  if docker exec sph-ci-dns dig +short +time=1 +tries=1 @127.0.0.1 allowed.test | grep -q '^192.0.2.42$'; then break; fi
  sleep 1
done
test "$(docker exec sph-ci-dns dig +short @127.0.0.1 allowed.test)" = 192.0.2.42
test "$(docker exec sph-ci-dns dig +short @127.0.0.1 blocked.test)" = 0.0.0.0
docker run -d --name sph-ci-ui --network container:sph-ci-dns --read-only --cap-drop ALL \
  --mount type=volume,src=sph-ci-ui-data,dst=/data \
  --tmpfs /tmp:size=64m -e PUBLIC_ORIGIN=http://127.0.0.1:20721 \
  -e SUPER_PIHOLE_PASSWORD=ci-only-long-test-password -e PIHOLE_URL=http://127.0.0.1:20720 \
  -e PIHOLE_WRITE_ENABLED=true -e SUPER_PIHOLE_INTEGRATED=true "$image"
for i in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:20721/healthz; then break; fi
  sleep 1
done
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:20721/live-api/overview)" = 401
cookie=$(mktemp)
curl --fail -s -c "$cookie" -H 'Origin: http://127.0.0.1:20721' -H 'Content-Type: application/json' \
  -d '{"password":"ci-only-long-test-password"}' http://127.0.0.1:20721/session-api/login
curl --fail -s -b "$cookie" http://127.0.0.1:20721/live-api/overview | jq -e '.data.summary.queries.total > 0'
if ! curl --fail-with-body -s -b "$cookie" http://127.0.0.1:20721/admin/ -o /tmp/sph-stock-view.html; then
  docker exec sph-ci-dns curl -i -s http://127.0.0.1:20720/admin/ | head -c 4000
  docker exec sph-ci-dns pihole-FTL --config webserver.paths
  exit 1
fi
test "$(curl -s -b "$cookie" -o /dev/null -w '%{http_code}' -X PATCH -H 'Origin: http://127.0.0.1:20721' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:20721/api/config)" = 403
curl --fail-with-body -s -b "$cookie" -H 'Origin: http://127.0.0.1:20721' -H 'Content-Type: application/json' -H 'X-Super-Pihole-Review: 1' \
  -d '{"action":"domain-add","domain":"controller.test","type":"deny","kind":"exact","enabled":true,"groups":[0],"comment":"CI control rule","confirmed":true}' http://127.0.0.1:20721/live-api/action
test "$(docker exec sph-ci-dns dig +short @127.0.0.1 controller.test)" = 0.0.0.0
curl --fail-with-body -s -b "$cookie" http://127.0.0.1:20721/live-api/devices | jq -e '.devices | type == "array"'
curl --fail-with-body -s -b "$cookie" -H 'Origin: http://127.0.0.1:20721' -H 'Content-Type: application/json' -H 'X-Super-Pihole-Review: 1' \
  -d '{"action":"group-save","name":"CI family","create":true,"enabled":true,"comment":"Synthetic test group","confirmed":true}' http://127.0.0.1:20721/live-api/action | jq -e '.verified.groups | any(.name == "CI family")'
curl --fail-with-body -s -b "$cookie" -H 'Origin: http://127.0.0.1:20721' -H 'Content-Type: application/json' -H 'X-Super-Pihole-Review: 1' \
  -d '{"action":"client-assign","client":"192.0.2.99","groups":[1],"expected":null,"confirmed":true}' http://127.0.0.1:20721/live-api/action | jq -e '.verified.clients[0].groups == [1]'
curl --fail-with-body -s -b "$cookie" http://127.0.0.1:20721/live-api/teleporter -o /tmp/sph-teleporter.zip
unzip -t /tmp/sph-teleporter.zip
docker restart sph-ci-dns >/dev/null
for i in $(seq 1 30); do
  if docker exec sph-ci-dns dig +short +time=1 +tries=1 @127.0.0.1 blocked.test | grep -q '^0.0.0.0$'; then break; fi
  sleep 1
done
test "$(docker exec sph-ci-dns dig +short @127.0.0.1 allowed.test)" = 192.0.2.42
test "$(docker exec sph-ci-dns dig +short @127.0.0.1 blocked.test)" = 0.0.0.0
test "$(docker exec sph-ci-dns dig +short @127.0.0.1 controller.test)" = 0.0.0.0
echo 'Integrated DNS, existing rules, controller writes, stock write rejection, and restart persistence passed.'

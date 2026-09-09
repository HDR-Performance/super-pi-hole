import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { load } from 'js-yaml';
import { backupUpgrade } from '../deploy/backup-upgrade.mjs';
import { createStockInterface } from '../server/stock-interface.mjs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('migration copies and verifies original data without altering it', () => {
  const root = mkdtempSync(join(tmpdir(), 'sph-migration-'));
  const config = join(root, 'config'), dnsmasq = join(root, 'dnsmasq');
  mkdirSync(config); mkdirSync(dnsmasq);
  const original = '[dns]\nupstreams=["192.0.2.53"]\n';
  writeFileSync(join(config, 'pihole.toml'), original);
  writeFileSync(join(config, 'gravity.db'), Buffer.from('migration fixture'));
  writeFileSync(join(dnsmasq, 'custom.conf'), 'address=/home.test/192.0.2.1');
  const result = backupUpgrade({ config, dnsmasq, destination: join(root, 'backups') });
  assert.equal(result.files, 3);
  assert.equal(readFileSync(join(result.target, 'config/pihole.toml'), 'utf8'), original);
  assert.equal(readFileSync(join(config, 'pihole.toml'), 'utf8'), original);
  assert.equal(JSON.parse(readFileSync(join(result.target, 'manifest.json'))).files.length, 3);
});
test('upgrade backup includes existing controller database and WAL files', () => {
  const root = mkdtempSync(join(tmpdir(), 'sph-full-backup-'));
  const config = join(root, 'config'), dnsmasq = join(root, 'dnsmasq'), appData = join(root, 'data');
  for (const dir of [config, dnsmasq, appData]) mkdirSync(dir);
  writeFileSync(join(config, 'pihole.toml'), '[dns]');
  writeFileSync(join(config, 'gravity.db'), 'original rules');
  for (const file of ['review.sqlite', 'review.sqlite-wal', 'review.sqlite.family.sqlite', 'review.sqlite.lancache.sqlite', 'review.sqlite.lancache.sqlite-wal', 'review.sqlite.lancache.sqlite.key']) writeFileSync(join(appData, file), 'existing ' + file);
  const result = backupUpgrade({ config, dnsmasq, appData, destination: join(root, 'backups') });
  assert.equal(result.files, 8);
  for (const file of ['review.sqlite', 'review.sqlite-wal', 'review.sqlite.family.sqlite', 'review.sqlite.lancache.sqlite', 'review.sqlite.lancache.sqlite-wal', 'review.sqlite.lancache.sqlite.key']) assert.equal(readFileSync(join(result.target, 'super-pi-hole-data', file), 'utf8'), 'existing ' + file);
  assert.throws(() => backupUpgrade({ config, dnsmasq, appData, destination: join(appData, 'backups') }), /outside/);
});
test('existing-app template retains data and explicitly offers local password-free mode', () => {
  const config = load(readFileSync(new URL('../deploy/truenas-existing-app.yaml', import.meta.url), 'utf8'));
  assert.equal(config.volumes['super-pi-hole-data'].external, true);
  assert.equal(config.volumes['super-pi-hole-data'].name, 'ix-super-pi-hole_super-pi-hole-data');
  assert.equal(config.services.backup, undefined);
  assert.equal(config.services.pihole.depends_on, undefined);
  assert.equal(config.services.pihole.environment.FTLCONF_webserver_api_password, '');
  assert.equal(config.services['super-pi-hole'].environment.SUPER_PIHOLE_AUTH_DISABLED, 'true');
  assert.equal(config.services['super-pi-hole'].environment.SUPER_PIHOLE_PASSWORD, undefined);
  assert.equal(config.services['super-pi-hole'].environment.PIHOLE_PASSWORD, '');
  assert.deepEqual(config.services['super-pi-hole'].volumes, ['super-pi-hole-data:/data']);
  assert.equal(config['x-portals'][0].path, '/');
  assert.equal(config['x-portals'][0].port, 20721);
  for (const service of Object.values(config.services)) assert.equal(service.image, 'ghcr.io/hdr-performance/super-pi-hole:' + version);
});
test('stock interface cannot write to the engine or point to a remote host', async () => {
  let forwarded = 0;
  const stock = createStockInterface({ stockRead: async () => { forwarded++; return {}; } }, { enabled: true, url: 'http://127.0.0.1:20720' });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) await assert.rejects(stock({ method, url: '/api/config' }, {}), /read-only/);
  assert.equal(forwarded, 0);
  assert.throws(() => createStockInterface({}, { enabled: true, url: 'http://192.0.2.1' }), /loopback/);
});
test('integrated YAML pins our image, backs up read-only, and preserves both original mounts', () => {
  const config = load(readFileSync(new URL('../deploy/truenas-upgrade.yaml', import.meta.url), 'utf8'));
  for (const service of Object.values(config.services)) {
    assert.equal(service.image, 'ghcr.io/hdr-performance/super-pi-hole:' + version);
    assert.equal(service.network_mode, 'host');
    assert.equal(service.build, undefined);
  }
  assert.equal(config.services.backup.volumes[0].read_only, true);
  assert.equal(config.services.backup.volumes[1].read_only, true);
  assert.equal(config.services.pihole.volumes[0].source, '/mnt/.ix-apps/app_mounts/pihole/config');
  assert.equal(config.services.pihole.volumes[1].target, '/etc/dnsmasq.d');
  assert.equal(config.services.pihole.depends_on.backup.condition, 'service_completed_successfully');
  assert.equal(config.services['super-pi-hole'].environment.SUPER_PIHOLE_INTEGRATED, 'true');
  assert.equal(config['x-portals'][0].port, 20721);
});

test('release generator supports the three-service migration and two-service in-place app', () => {
  const root = mkdtempSync(join(tmpdir(), 'sph-release-assets-'));
  mkdirSync(join(root, 'deploy'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
  writeFileSync(
    join(root, 'image-digest.txt'),
    'ghcr.io/hdr-performance/super-pi-hole@sha256:' + 'a'.repeat(64),
  );
  mkdirSync(join(root, 'branding'));
  for (const name of ['icon.png', 'icon.svg']) copyFileSync(new URL('../branding/' + name, import.meta.url), join(root, 'branding', name));
  for (const name of ['truenas-upgrade.yaml', 'truenas-existing-app.yaml', 'truenas-fresh-all-in-one.yaml']) {
    copyFileSync(new URL('../deploy/' + name, import.meta.url), join(root, 'deploy', name));
  }
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../deploy/release-assets.mjs', import.meta.url))],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const migration = load(readFileSync(join(root, 'super-pi-hole-truenas-upgrade.yaml'), 'utf8'));
  const inPlace = load(readFileSync(join(root, 'super-pi-hole-existing-app-upgrade.yaml'), 'utf8'));
  assert.equal(Object.keys(migration.services).length, 3);
  assert.equal(Object.keys(inPlace.services).length, 2);
  const fresh = load(readFileSync(join(root, 'super-pi-hole-truenas-fresh.yaml'), 'utf8'));
  assert.equal(Object.keys(fresh.services).length, 2);
  for (const config of [migration, inPlace, fresh]) {
    for (const service of Object.values(config.services)) {
      assert.equal(service.image, 'ghcr.io/hdr-performance/super-pi-hole@sha256:' + 'a'.repeat(64));
    }
  }
  assert.equal(readFileSync(join(root, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').length, 6);
});

test('fresh all-in-one TrueNAS install initializes new storage under one dataset root', () => {
  const config = load(readFileSync(new URL('../deploy/truenas-fresh-all-in-one.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(config.services), ['pihole', 'super-pi-hole']);
  assert.equal(config.services.pihole.build, undefined);
  for (const service of Object.values(config.services)) assert.equal(service.image, 'ghcr.io/hdr-performance/super-pi-hole:' + version);
  assert.equal(config.services.pihole.environment.FTLCONF_webserver_api_password, '');
  assert.equal(config.services.pihole.environment.FTLCONF_dns_upstreams, '1.1.1.1;1.0.0.1');
  assert.equal(config.services['super-pi-hole'].environment.SUPER_PIHOLE_AUTH_DISABLED, 'true');
  assert.equal(config.services['super-pi-hole'].environment.PIHOLE_PASSWORD, '');
  assert.match(config.services['super-pi-hole'].command.join(' '), /gui-startup\.log/);
  const sources = Object.values(config.services).flatMap((service) => service.volumes).map((volume) => volume.source);
  assert.deepEqual(sources, [
    '/mnt/tank/apps/super-pi-hole/pihole-config',
    '/mnt/tank/apps/super-pi-hole/dnsmasq',
    '/mnt/tank/apps/super-pi-hole/data',
  ]);
  assert.ok(sources.every((source) => source.startsWith('/mnt/tank/apps/super-pi-hole/')));
  assert.equal(config['x-portals'][0].port, 20721);
});

test('DNS startup supports a fresh volume before migrating existing gravity data', () => {
  const script = readFileSync(new URL('../deploy/start-dns.sh', import.meta.url), 'utf8');
  const dockerfile = readFileSync(new URL('../deploy/Dockerfile.integrated', import.meta.url), 'utf8');
  assert.ok(script.indexOf('ftl_config') < script.indexOf('gravityDBfile='));
  assert.match(script, /if \[\[ ! -f "\$gravityDBfile" \]\]; then[\s\S]*migrate_gravity/);
  assert.match(script, /else[\s\S]*upgrade_gravityDB/);
  assert.doesNotMatch(script, /Existing gravity database required/);
  assert.match(dockerfile, /chmod -R a\+rX \/app \/var\/www\/html\/admin \/etc\/\.pihole/);
});

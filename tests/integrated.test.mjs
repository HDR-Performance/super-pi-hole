import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { backupUpgrade } from '../deploy/backup-upgrade.mjs';
import { createStockInterface } from '../server/stock-interface.mjs';

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
  for (const file of ['review.sqlite', 'review.sqlite-wal', 'review.sqlite.family.sqlite']) writeFileSync(join(appData, file), 'existing ' + file);
  const result = backupUpgrade({ config, dnsmasq, appData, destination: join(root, 'backups') });
  assert.equal(result.files, 5);
  for (const file of ['review.sqlite', 'review.sqlite-wal', 'review.sqlite.family.sqlite']) assert.equal(readFileSync(join(result.target, 'super-pi-hole-data', file), 'utf8'), 'existing ' + file);
  assert.throws(() => backupUpgrade({ config, dnsmasq, appData, destination: join(appData, 'backups') }), /outside/);
});
test('existing-app template retains the deployed external data volume and main UI portal', () => {
  const config = load(readFileSync(new URL('../deploy/truenas-existing-app.yaml', import.meta.url), 'utf8'));
  assert.equal(config.volumes['super-pi-hole-data'].external, true);
  assert.equal(config.volumes['super-pi-hole-data'].name, 'ix-super-pi-hole_super-pi-hole-data');
  assert.equal(config.services.backup.environment.EXISTING_SUPER_DATA_REQUIRED, 'true');
  assert.equal(config.services['super-pi-hole'].environment.SUPER_PIHOLE_PASSWORD, config.services.backup.environment.SUPER_PIHOLE_PASSWORD);
  assert.deepEqual(config.services['super-pi-hole'].volumes, ['super-pi-hole-data:/data']);
  assert.equal(config['x-portals'][0].path, '/');
  assert.equal(config['x-portals'][0].port, 20721);
  for (const service of Object.values(config.services)) assert.equal(service.image, 'ghcr.io/hdr-performance/super-pi-hole:0.4.0-test');
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
    assert.equal(service.image, 'ghcr.io/hdr-performance/super-pi-hole:0.4.0-test');
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

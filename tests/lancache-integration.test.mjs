import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLanCacheIntegration, managementUrl } from '../server/lancache-integration.mjs';

const responses = (instanceId = 'lan-cache-instance-1') => async (url, init) => {
  assert.equal(init.headers.Authorization, 'Bearer pair-secret');
  const path = new URL(url).pathname;
  const body = path.endsWith('/identity')
    ? { apiVersion: 1, product: 'lancache', version: '0.1.0', instanceId, capabilities: ['status.read', 'services.read'] }
    : path.endsWith('/status')
      ? { engine: { healthy: true }, sampledAt: '2026-09-06T00:00:00.000Z', contentAddresses: { ipv4: ['192.168.0.8'], ipv6: [] }, managementUrl: 'http://192.168.0.8:20722/' }
      : { revision: 'cache-domains-test-1', services: [{ id: 'steam', name: 'Steam', domains: [{ type: 'exact', domain: 'lancache.steamcontent.com' }, { type: 'wildcard', domain: 'steamcontent.com' }] }] };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};
const engine = (initial = ['server=/local/192.168.0.1']) => {
  let lines = [...initial];
  return { integrationState: async () => ({ lines: [...lines], domains: [] }), replaceIntegrationLines: async (expected, next) => { assert.deepEqual(lines, expected); lines = [...next]; return { lines }; }, lines: () => lines };
};

test('LanCache management URL accepts explicit private peers and rejects SSRF targets', () => {
  assert.equal(managementUrl('http://192.168.0.8:20722/'), 'http://192.168.0.8:20722/');
  for (const value of ['https://example.com/', 'http://169.254.169.254/', 'file:///tmp/a', 'http://user:pass@192.168.0.8/', 'http://192.168.0.8/path']) assert.throws(() => managementUrl(value));
});

test('pairing token is encrypted at rest, masked on reads, and survives restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sph-lancache-')), path = join(dir, 'integration.sqlite'), pihole = engine();
  let service = createLanCacheIntegration({ path, pihole, fetchImpl: responses() });
  let state = await service.configure({ revision: 0, enabled: true, managementUrl: 'http://192.168.0.8:20722/', pairingToken: 'pair-secret' });
  assert.equal(state.hasToken, true); assert.equal(state.pairingToken, '••••••••'); assert.equal(JSON.stringify(state).includes('pair-secret'), false);
  service.close();
  assert.equal(readFileSync(path).includes(Buffer.from('pair-secret')), false);
  service = createLanCacheIntegration({ path, pihole, fetchImpl: responses() });
  assert.equal(service.snapshot().hasToken, true); service.close(); rmSync(dir, { recursive: true });
});

test('pairing, preview, apply and restore are explicit and preserve unrelated Pi-hole lines', async () => {
  const pihole = engine(), service = createLanCacheIntegration({ path: ':memory:', pihole, fetchImpl: responses(), clock: () => Date.parse('2026-09-06T00:00:00Z') });
  let state = await service.configure({ revision: 0, enabled: true, managementUrl: 'http://192.168.0.8:20722/', pairingToken: 'pair-secret' });
  assert.equal(pihole.lines().length, 1); assert.equal(state.connection.state, 'Not paired');
  state = await service.test(); assert.equal(state.connection.state, 'Connected'); assert.equal(state.catalog.services[0].id, 'steam');
  const plan = await service.preview(['steam']); assert.equal(pihole.lines().length, 1); assert.ok(plan.routeCount === 2 && plan.add.some((line) => line.includes('lancache.steamcontent.com')));
  state = await service.apply({ revision: state.revision, selectedServices: ['steam'], previewHash: plan.previewHash });
  assert.equal(state.routes.state, 'applied'); assert.ok(pihole.lines().some((line) => line.includes('super-pi-hole-lancache:v1'))); assert.ok(pihole.lines().includes('server=/local/192.168.0.1'));
  state = await service.rollback(state.revision); assert.equal(state.routes.state, 'none'); assert.deepEqual(pihole.lines(), ['server=/local/192.168.0.1']);
  service.close();
});

test('unreachable peers never report Connected', async () => {
  const service = createLanCacheIntegration({ path: ':memory:', pihole: engine(), fetchImpl: async () => { throw Error('offline'); } });
  await service.configure({ revision: 0, enabled: true, managementUrl: 'http://192.168.0.8:20722/', pairingToken: 'pair-secret' });
  await assert.rejects(() => service.test()); assert.equal(service.snapshot().connection.state, 'Unreachable'); service.close();
});

test('a changed peer identity is incompatible until pairing is explicitly cleared', async () => {
  let instanceId = 'lan-cache-instance-1';
  const service = createLanCacheIntegration({ path: ':memory:', pihole: engine(), fetchImpl: (...args) => responses(instanceId)(...args) });
  await service.configure({ revision: 0, enabled: true, managementUrl: 'http://192.168.0.8:20722/', pairingToken: 'pair-secret' });
  let state = await service.test(); assert.equal(state.pinnedInstanceId, instanceId);
  instanceId = 'lan-cache-instance-2';
  await assert.rejects(() => service.test(), /identity changed/);
  state = service.snapshot(); assert.equal(state.connection.state, 'Incompatible'); assert.equal(state.pinnedInstanceId, 'lan-cache-instance-1');
  service.close();
});

test('an unconfirmed Pi-hole write retains owned recovery state and never reports routes applied', async () => {
  const pihole = engine();
  pihole.replaceIntegrationLines = async () => { throw Error('engine write failed'); };
  const service = createLanCacheIntegration({ path: ':memory:', pihole, fetchImpl: responses() });
  await service.configure({ revision: 0, enabled: true, managementUrl: 'http://192.168.0.8:20722/', pairingToken: 'pair-secret' });
  const connected = await service.test(), plan = await service.preview(['steam']);
  await assert.rejects(() => service.apply({ revision: connected.revision, selectedServices: ['steam'], previewHash: plan.previewHash }), /engine write failed/);
  const state = service.snapshot();
  assert.equal(state.routes.state, 'attention'); assert.equal(state.connection.state, 'Routes pending'); assert.ok(state.routes.managedLines.length > 0);
  service.close();
});

test('route preview reports unmanaged domain conflicts and cannot mutate DNS', async () => {
  const pihole = engine(['address=/steamcontent.com/192.168.0.99']), service = createLanCacheIntegration({ path: ':memory:', pihole, fetchImpl: responses() });
  let state = await service.configure({ revision: 0, enabled: true, managementUrl: 'http://192.168.0.8:20722/', pairingToken: 'pair-secret' }); state = await service.test();
  const plan = await service.preview(['steam']); assert.equal(plan.conflicts.length, 1); assert.deepEqual(pihole.lines(), ['address=/steamcontent.com/192.168.0.99']);
  await assert.rejects(() => service.apply({ revision: state.revision, selectedServices: ['steam'], previewHash: plan.previewHash }), /overlap/); service.close();
});

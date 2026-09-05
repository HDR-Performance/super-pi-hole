import test from 'node:test';
import assert from 'node:assert/strict';
import { createPiholeClient } from '../server/pihole-service.mjs';
import { fixtureFetch } from './fixtures/pihole-fixture.mjs';
const setup = () => { const api = fixtureFetch(); return { api, client: createPiholeClient({ url: 'http://127.0.0.1:20720', fetchImpl: api.request, writeEnabled: true, controlled: true }) }; };
test('device inventory comes from FTL with real client groups and coverage boundaries', async () => {
  const { client, api } = setup(), data = await client.read('devices');
  assert.equal(data.devices[0].ips[0].ip, '192.0.2.20'); assert.equal(data.clients[0].groups[0], 1);
  assert.match(data.coverage, /observed/); assert.equal(api.calls.length, 3);
});
test('client assignment preserves comments, verifies readback and rejects a stale edit', async () => {
  const { client } = setup(), current = (await client.read('clients')).clients[0];
  const action = { action: 'client-assign', client: current.client, groups: [0, 1], expected: current, confirmed: true };
  const result = await client.act(action);
  assert.deepEqual(result.verified.clients[0].groups, [0, 1]); assert.equal(result.verified.clients[0].comment, current.comment);
  await assert.rejects(client.act(action), /changed/);
  await assert.rejects(client.act({ ...action, client: '../config' }), /IPv4/);
});
test('engine configuration rejects protected boundaries and sends only changed settings', async () => {
  const { client, api } = setup(), current = (await client.read('engine-config')).config;
  await assert.rejects(client.act({ action: 'config-set', config: { webserver: { port: '80' } }, confirmed: true }), /managed/);
  await client.act({ action: 'config-set', config: { dns: { ...current.dns, dnssec: true } }, expected: { dns: current.dns }, confirmed: true });
  assert.deepEqual(api.calls.find(c => c.method === 'PATCH').body, { config: { dns: { dnssec: true } } });
  assert.equal((await client.read('engine-config')).config.dns.upstreams[0], '192.0.2.53');
});
test('stock API remains read-only and never exposes the engine SID', async () => {
  const { client } = setup(); assert.equal(client.info().adminUrl, '/admin/');
  await assert.rejects(client.stockRead('action/gravity'), /Unsupported/);
  await assert.rejects(client.stockRead('stats/../../auth'), /Unsupported/);
});

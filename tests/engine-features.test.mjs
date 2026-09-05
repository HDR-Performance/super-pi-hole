import test from 'node:test';
import assert from 'node:assert/strict';
import { createPiholeClient } from '../server/pihole-service.mjs';
import { fixtureFetch } from './fixtures/pihole-fixture.mjs';
import {
  editableSetting,
  flattenSettings,
  settingPayload,
} from '../lib/engine-settings.mjs';
const setup = () => {
  const f = fixtureFetch();
  return {
    f,
    c: createPiholeClient({
      url: 'http://fixture.example',
      writeEnabled: true,
      fetchImpl: f.request,
    }),
  };
};

test('settings metadata excludes secrets and locks deployment-managed fields', async () => {
  const { c } = setup();
  const { fields } = await c.read('settings');
  assert.ok(fields.find((f) => f.path === 'dns.dnssec').editable);
  assert.equal(fields.find((f) => f.path === 'dns.port').editable, false);
  assert.equal(
    fields.find((f) => f.path === 'dns.listeningMode').editable,
    false,
  );
  for (const path of [
    'webserver.api.pwhash',
    'files.database',
    'misc.dnsmasq_lines',
    'misc.readOnly',
    'dns.port',
    '__proto__.polluted',
  ])
    assert.equal(editableSetting(path), false);
  assert.deepEqual(
    flattenSettings({
      webserver: {
        api: { pwhash: { value: 'do-not-expose', type: 'string' } },
      },
    }),
    [],
  );
  assert.throws(() =>
    settingPayload([{ path: '__proto__.polluted', value: true }]),
  );
});

test('metadata settings save sends only reviewed fields and verifies readback', async () => {
  const { c, f } = setup();
  const result = await c.act({
    action: 'settings-save',
    confirmed: true,
    changes: [
      { path: 'dns.dnssec', expected: false, value: true },
      { path: 'misc.privacylevel', expected: 0, value: 1 },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls.find((call) => call.method === 'PATCH').body, {
    config: { dns: { dnssec: true }, misc: { privacylevel: 1 } },
  });
  const config = (await c.read('engine-config')).config;
  assert.deepEqual(config.dns.upstreams, ['192.0.2.53']);
  assert.equal(config.dns.port, 53);
  assert.equal(config.database.maxDBdays, 91);
});

test('stale, unknown, locked and invalid settings never reach a config write', async () => {
  const { c, f } = setup();
  for (const [path, expected, value] of [
    ['dns.port', 53, 54],
    ['dns.listeningMode', 'LOCAL', 'ALL'],
    ['dns.dnssec', true, false],
    ['dns.dnssec', false, 'yes'],
    ['dns.upstreams', ['192.0.2.53'], ['bad\nvalue']],
    ['misc.privacylevel', 0, 4],
    ['constructor.prototype', null, 'bad'],
  ]) {
    await assert.rejects(
      c.act({
        action: 'settings-save',
        confirmed: true,
        changes: [{ path, expected, value }],
      }),
    );
  }
  assert.equal(f.calls.filter((call) => call.method === 'PATCH').length, 0);
});

test('DHCP enable requires a separate competing-server acknowledgement', async () => {
  const { c, f } = setup();
  const body = {
    action: 'settings-save',
    confirmed: true,
    changes: [{ path: 'dhcp.active', expected: false, value: true }],
  };
  await assert.rejects(c.act(body), { status: 400 });
  assert.equal(f.calls.filter((call) => call.method === 'PATCH').length, 0);
  assert.equal((await c.act({ ...body, dhcpAcknowledged: true })).ok, true);
});

test('maintenance requires exact acknowledgement and never accepts arbitrary paths', async () => {
  const { c, f } = setup();
  for (const body of [
    { operation: 'restartdns' },
    { operation: '../config', acknowledgement: '../config' },
    { operation: 'flush-logs', acknowledgement: 'restartdns' },
  ])
    await assert.rejects(
      c.act({ action: 'maintenance', confirmed: true, ...body }),
      { status: 400 },
    );
  assert.equal(f.calls.length, 0);
  await c.act({
    action: 'maintenance',
    confirmed: true,
    operation: 'restartdns',
    acknowledgement: 'restartdns',
  });
  assert.equal(f.calls.at(-1).path, '/api/action/restartdns');
});

test('list searches encode hostnames, reject URL injection and do not mutate lists', async () => {
  const { c, f } = setup();
  const result = await c.read(
    'search-lists',
    new URLSearchParams({ domain: 'telemetry.example', partial: 'true' }),
  );
  assert.equal(result.search.domains[0].domain, 'telemetry.example');
  assert.equal(f.calls[0].method, 'GET');
  await assert.rejects(
    c.read(
      'search-lists',
      new URLSearchParams({ domain: 'http://evil.example' }),
    ),
    { status: 400 },
  );
  await assert.rejects(
    c.read('logs', new URLSearchParams({ file: '../../etc/passwd' })),
    { status: 400 },
  );
});

test('lease deletion requires an unchanged exact record', async () => {
  const { c, f } = setup();
  const lease = (await c.read('leases')).leases[0];
  await assert.rejects(
    c.act({
      action: 'lease-delete',
      confirmed: true,
      ip: lease.ip,
      expected: { ...lease, name: 'different' },
    }),
    { status: 409 },
  );
  assert.equal(f.calls.filter((call) => call.method === 'DELETE').length, 0);
  await c.act({
    action: 'lease-delete',
    confirmed: true,
    ip: lease.ip,
    expected: lease,
  });
  assert.deepEqual((await c.read('leases')).leases, []);
});

test('historical query source is explicit and cannot bypass query filtering', async () => {
  const { c, f } = setup();
  await c.read(
    'queries',
    new URLSearchParams({
      disk: 'true',
      from: '1700000000',
      until: '1700086400',
    }),
  );
  assert.equal(new URLSearchParams(f.calls[0].query).get('disk'), 'true');
  await assert.rejects(
    c.read('queries', new URLSearchParams({ disk: 'arbitrary' })),
    { status: 400 },
  );
});

test('domain editing preserves identity and validates groups and stale snapshots', async () => {
  const { c, f } = setup();
  const expected = (await c.read('domains')).domains[0];
  const body = {
    action: 'domain-edit',
    confirmed: true,
    type: expected.type,
    kind: expected.kind,
    domain: expected.domain,
    nextType: 'allow',
    enabled: false,
    comment: 'Reviewed fixture rule',
    groups: [1],
    expected,
  };
  await assert.rejects(c.act({ ...body, groups: [999] }), { status: 400 });
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 0);
  assert.equal((await c.act(body)).ok, true);
  const rule = (await c.read('domains')).domains[0];
  assert.equal(rule.id, expected.id);
  assert.equal(rule.type, 'allow');
  assert.equal(rule.enabled, false);
  assert.deepEqual(rule.groups, [1]);
  await assert.rejects(c.act(body), { status: 409 });
});

test('client editor supports documented subnet, interface and hostname identities', async () => {
  const { c, f } = setup();
  for (const client of [
    '192.0.2.0/24',
    '2001:db8::/64',
    ':eth0',
    'tablet.home.arpa',
  ]) {
    await c.act({
      action: 'client-save',
      confirmed: true,
      client,
      expected: null,
      groups: [1],
      comment: null,
    });
    const current = (await c.read('clients')).clients.find(
      (c) => c.client === client,
    );
    assert.deepEqual(current.groups, [1]);
    await c.act({
      action: 'client-delete',
      confirmed: true,
      client,
      expected: current,
    });
    assert.equal(
      (await c.read('clients')).clients.some((c) => c.client === client),
      false,
    );
  }
  const before = f.calls.length;
  for (const client of [
    '../config',
    '192.0.2.0/33',
    '2001:db8::/129',
    'http://evil.example',
    ':',
    'bad\nname',
  ])
    await assert.rejects(
      c.act({
        action: 'client-save',
        client,
        expected: null,
        confirmed: true,
        groups: [0],
        comment: null,
      }),
      { status: 400 },
    );
  assert.equal(f.calls.length, before);
});

test('groups and subscriptions have verified create, update and delete without changing defaults', async () => {
  const { c } = setup();
  await c.act({
    action: 'group-save',
    confirmed: true,
    create: true,
    name: 'Family test',
    enabled: true,
    comment: null,
  });
  let group = (await c.read('groups')).groups.find(
    (g) => g.name === 'Family test',
  );
  await c.act({
    action: 'group-save',
    confirmed: true,
    expected: group,
    name: 'Family renamed',
    previous: group.name,
    enabled: false,
    comment: 'Test only',
  });
  group = (await c.read('groups')).groups.find((g) => g.id === group.id);
  assert.equal(group.name, 'Family renamed');
  assert.equal(group.enabled, false);
  await c.act({
    action: 'group-delete',
    confirmed: true,
    expected: group,
    name: group.name,
    previous: group.name,
  });
  assert.equal((await c.read('groups')).groups[0].name, 'Default');
  const address = 'https://lists.example/optional.txt';
  await c.act({
    action: 'list-save',
    confirmed: true,
    create: true,
    address,
    type: 'allow',
    enabled: true,
    comment: null,
    groups: [1],
  });
  let list = (await c.read('lists')).lists.find((l) => l.address === address);
  assert.equal(list.type, 'allow');
  await c.act({
    action: 'list-save',
    confirmed: true,
    expected: list,
    address,
    type: 'allow',
    enabled: false,
    comment: 'Opt-in',
    groups: [],
  });
  list = (await c.read('lists')).lists.find((l) => l.address === address);
  assert.deepEqual(list.groups, []);
  assert.equal(list.enabled, false);
  await c.act({
    action: 'list-delete',
    confirmed: true,
    expected: list,
    address,
    type: 'allow',
  });
  assert.equal((await c.read('lists')).lists.length, 1);
});

test('advanced JSON cannot bypass DHCP acknowledgement or listener locks', async () => {
  const { c, f } = setup(),
    current = (await c.read('engine-config')).config;
  await assert.rejects(
    c.act({
      action: 'config-set',
      confirmed: true,
      config: { dhcp: { ...current.dhcp, active: true } },
      expected: { dhcp: current.dhcp },
    }),
    { status: 400 },
  );
  await assert.rejects(
    c.act({
      action: 'config-set',
      confirmed: true,
      config: { dns: { ...current.dns, listeningMode: 'ALL' } },
      expected: { dns: current.dns },
    }),
    { status: 400 },
  );
  assert.equal(
    f.calls.some((c) => c.method === 'PATCH'),
    false,
  );
});

test('stored statistics use database routes and reject unbounded or reversed ranges', async () => {
  const { c, f } = setup();
  const result = await c.read(
    'historical',
    new URLSearchParams({ from: '1700000000', until: '1700604800' }),
  );
  assert.equal(result.data.summary.sum_queries, 250);
  assert.deepEqual(result.errors, {});
  assert.equal(f.calls.length, 8);
  assert.ok(
    f.calls.every(
      (c) =>
        c.path.includes('/database') &&
        new URLSearchParams(c.query).get('from') === '1700000000',
    ),
  );
  for (const params of [
    {},
    { from: '2', until: '1' },
    { from: '0', until: '99999999999' },
    { from: '1', until: '2', path: '../config' },
  ])
    await assert.rejects(c.read('historical', new URLSearchParams(params)), {
      status: 400,
    });
});

test('logs are bounded and basic credential markers redacted; all new writes require unlock and confirmation', async () => {
  const c = createPiholeClient({
    url: 'http://fixture.example',
    fetchImpl: async () =>
      Response.json({
        log: Array.from({ length: 400 }, (_, timestamp) => ({
          timestamp,
          message: 'password=fixture-secret token=another-fixture-secret safe',
        })),
        nextID: 400,
      }),
  });
  const data = await c.read('logs');
  assert.equal(data.log.length, 300);
  assert.match(data.log[0].message, /password=\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(data), /fixture-secret/);
  for (const action of [
    'settings-save',
    'domain-edit',
    'client-save',
    'client-delete',
    'lease-delete',
    'maintenance',
    'message-dismiss',
  ]) {
    await assert.rejects(c.act({ action, confirmed: true }), { status: 403 });
    await assert.rejects(setup().c.act({ action }), { status: 400 });
  }
});

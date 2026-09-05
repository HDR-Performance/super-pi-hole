import test from 'node:test';
import assert from 'node:assert/strict';
import { createPiholeClient, hostname } from '../server/pihole-service.mjs';
import { fixtureFetch } from './fixtures/pihole-fixture.mjs';
const url = 'http://pihole.example:80';
test('unconfigured connector is explicit and performs no network requests', async () => {
  const f = fixtureFetch(),
    c = createPiholeClient({ fetchImpl: f.request });
  assert.equal(c.info().configured, false);
  await assert.rejects(c.read('domains'), { status: 503 });
  assert.equal(f.calls.length, 0);
});
test('upstream address rejects embedded credentials, queries, and arbitrary paths', () => {
  for (const value of [
    'file:///etc/passwd',
    'http://a:b@example.com',
    'http://example.com?sid=secret',
    'http://example.com/admin',
  ])
    assert.throws(() => createPiholeClient({ url: value }));
});
test('overview uses actual v6 endpoints and never changes blocking', async () => {
  const f = fixtureFetch(),
    c = createPiholeClient({ url, fetchImpl: f.request });
  const result = await c.read('overview');
  assert.equal(result.data.summary.queries.total, 250);
  assert.equal(result.data.blocking.blocking, 'disabled');
  assert.deepEqual(result.errors, {});
  assert.ok(f.calls.every((c) => c.method === 'GET'));
});
test('queries are bounded, filters encoded, and arbitrary proxy parameters rejected', async () => {
  const f = fixtureFetch(),
    c = createPiholeClient({ url, fetchImpl: f.request });
  await c.read(
    'queries',
    new URLSearchParams({
      domain: '*.example',
      client_ip: '192.0.2.20',
      cursor: '100',
    }),
  );
  const p = new URLSearchParams(f.calls[0].query);
  assert.equal(p.get('length'), '100');
  assert.equal(p.get('domain'), '*.example');
  await assert.rejects(
    c.read('queries', new URLSearchParams({ url: 'http://evil.example' })),
    { status: 400 },
  );
  await assert.rejects(
    c.read('queries', new URLSearchParams({ cursor: '-1' })),
    { status: 400 },
  );
  await assert.rejects(c.read('../auth/sessions'), { status: 404 });
});
test('read-only and unconfirmed changes fail before any upstream call', async () => {
  const f = fixtureFetch();
  await assert.rejects(
    createPiholeClient({ url, fetchImpl: f.request }).act({
      action: 'blocking',
      blocking: true,
      timer: null,
      confirmed: true,
    }),
    { status: 403 },
  );
  await assert.rejects(
    createPiholeClient({ url, fetchImpl: f.request, writeEnabled: true }).act({
      action: 'blocking',
      blocking: true,
      timer: null,
    }),
    { status: 400 },
  );
  assert.equal(f.calls.length, 0);
});
test('timed control is delegated to Pi-hole and validated', async () => {
  const f = fixtureFetch(),
    c = createPiholeClient({ url, fetchImpl: f.request, writeEnabled: true });
  await c.act({
    action: 'blocking',
    blocking: false,
    timer: 300,
    confirmed: true,
  });
  assert.deepEqual(f.calls[0].body, { blocking: false, timer: 300 });
  await assert.rejects(
    c.act({ action: 'blocking', blocking: false, timer: 0, confirmed: true }),
    { status: 400 },
  );
});

test('short, custom, indefinite and resume controls preserve engine timer semantics', async () => {
  const f = fixtureFetch({ clock: () => 10000 }), c = createPiholeClient({ url, fetchImpl: f.request, writeEnabled: true });
  for (const timer of [1, 10, 30, 450, 86400, null]) {
    await c.act({ action: 'blocking', blocking: false, timer, confirmed: true });
    assert.deepEqual(f.calls.at(-1).body, { blocking: false, timer });
    const state = (await c.read('overview')).data.blocking;
    assert.equal(state.blocking, 'disabled');
    assert.equal(state.timer, timer);
  }
  await c.act({ action: 'blocking', blocking: true, timer: null, confirmed: true });
  assert.deepEqual((await c.read('overview')).data.blocking, { blocking: 'enabled', timer: null });
  const before = f.calls.length;
  for (const timer of [undefined, -1, 0, 0.5, 86401, '300', '', false, {}, Infinity, NaN]) {
    await assert.rejects(c.act({ action: 'blocking', blocking: false, timer, confirmed: true }), { status: 400 });
  }
  assert.equal(f.calls.length, before, 'invalid timers never reach the engine');
});
test('domain rules preserve explicit group scope and delete exact encoded targets', async () => {
  const f = fixtureFetch(),
    c = createPiholeClient({ url, fetchImpl: f.request, writeEnabled: true });
  await c.act({
    action: 'domain-add',
    domain: 'Updates.Example',
    type: 'deny',
    kind: 'exact',
    comment: 'Test',
    groups: [1],
    confirmed: true,
  });
  assert.equal(f.calls[0].path, '/api/domains/deny/exact');
  assert.deepEqual(f.calls[0].body.groups, [1]);
  assert.equal(
    (await c.read('domains')).domains.find(
      (d) => d.domain === 'updates.example',
    ).type,
    'deny',
  );
  await c.act({
    action: 'domain-delete',
    domain: '^ads[.]example$',
    type: 'deny',
    kind: 'regex',
    confirmed: true,
  });
  assert.ok(
    f.calls.at(-1).path.endsWith(encodeURIComponent('^ads[.]example$')),
  );
  await assert.rejects(
    c.act({
      action: 'domain-add',
      domain: 'https://example.com',
      type: 'deny',
      kind: 'exact',
      comment: '',
      groups: [0],
      confirmed: true,
    }),
    { status: 400 },
  );
});
test('local DNS changes operate on one array item, never replace the entire config', async () => {
  const f = fixtureFetch(),
    c = createPiholeClient({ url, fetchImpl: f.request, writeEnabled: true });
  await c.act({
    action: 'local-dns-add',
    ip: '2001:db8::20',
    name: 'new.home.arpa',
    confirmed: true,
  });
  assert.equal(f.calls[0].method, 'PUT');
  assert.equal(f.calls[0].body, undefined);
  assert.ok(
    (await c.read('localdns')).hosts.includes('192.0.2.20 printer.home.arpa'),
  );
  await assert.rejects(
    c.act({
      action: 'local-dns-add',
      ip: 'not-an-ip',
      name: 'x.example',
      confirmed: true,
    }),
    { status: 400 },
  );
});
test('parallel reads share one Pi-hole authentication session and never expose its SID', async () => {
  const f = fixtureFetch(),
    c = createPiholeClient({
      url,
      password: 'upstream-secret',
      fetchImpl: f.request,
    });
  const result = await c.read('overview');
  assert.equal(f.calls.filter((c) => c.path === '/api/auth').length, 1);
  assert.ok(
    f.calls
      .filter((c) => c.method === 'GET')
      .every((c) => c.headers['X-FTL-SID'] === 'fixture-session'),
  );
  assert.ok(!JSON.stringify(result).includes('fixture-session'));
  assert.ok(!JSON.stringify(c.info()).includes('upstream-secret'));
});
test('expired GET session renews once; mutations are never replayed', async () => {
  let logins = 0,
    mutations = 0;
  const fetchImpl = async (u, init) => {
    if (u.pathname === '/api/auth')
      return Response.json({
        session: { valid: true, sid: 'session-' + ++logins },
      });
    if (init.method === 'POST') {
      mutations++;
      return Response.json({}, { status: 401 });
    }
    return init.headers['X-FTL-SID'] === 'session-1'
      ? Response.json({}, { status: 401 })
      : Response.json({ groups: [] });
  };
  const c = createPiholeClient({
    url,
    password: 'secret',
    writeEnabled: true,
    fetchImpl,
  });
  assert.deepEqual(await c.read('groups'), { groups: [] });
  assert.equal(logins, 2);
  await assert.rejects(
    c.act({ action: 'blocking', blocking: true, timer: null, confirmed: true }),
    { status: 502 },
  );
  assert.equal(mutations, 1);
});
test('invalid authentication and HTML responses are not reported as healthy data', async () => {
  const c = createPiholeClient({
    url,
    fetchImpl: async () => new Response('<html>Login</html>'),
  });
  await assert.rejects(c.read('domains'), { status: 502 });
  const denied = createPiholeClient({
    url,
    fetchImpl: async () => Response.json({}, { status: 401 }),
  });
  await assert.rejects(denied.read('domains'), { status: 502 });
});
test('HTTP success with per-item errors is not reported as a successful mutation', async () => {
  const c = createPiholeClient({
    url,
    writeEnabled: true,
    fetchImpl: async () =>
      Response.json({ processed: { errors: [{ item: 'x.example' }] } }),
  });
  await assert.rejects(
    c.act({ action: 'blocking', blocking: true, timer: null, confirmed: true }),
    { status: 502 },
  );
});
test('hostname validation supports IDNA and rejects URL/path injection', () => {
  assert.equal(hostname('printer.home.arpa.'), 'printer.home.arpa');
  for (const name of [
    '../auth',
    'foo/bar',
    '192.0.2.1',
    '*.example',
    '-bad.example',
    'x\nheader',
  ])
    assert.throws(() => hostname(name));
});
test('dashboard reads documented chart endpoints and preserves partial failures', async () => {
  const f = fixtureFetch();
  const c = createPiholeClient({
    url,
    fetchImpl: async (u, init) =>
      u.pathname === '/api/history/clients'
        ? Response.json({}, { status: 403 })
        : f.request(u, init),
  });
  const result = await c.read('overview');
  assert.equal(result.data.history.history.length, 48);
  assert.equal(result.data.queryTypes.types.A, 180);
  assert.equal(result.data.topBlocked.domains[0].domain, 'telemetry.example');
  assert.ok(result.errors.clientHistory);
  assert.equal(result.data.clientHistory, undefined);
  assert.ok(f.calls.every((call) => call.method === 'GET'));
});
test('query drill-down passes encoded time and type filters and rejects reversed ranges', async () => {
  const f = fixtureFetch(),
    c = createPiholeClient({ url, fetchImpl: f.request });
  await c.read(
    'queries',
    new URLSearchParams({ from: '1000', until: '1599.999', type: 'AAAA' }),
  );
  assert.equal(new URLSearchParams(f.calls[0].query).get('until'), '1599.999');
  for (const params of [
    { from: 'NaN' },
    { from: '-1' },
    { from: '2000', until: '1000' },
  ])
    await assert.rejects(c.read('queries', new URLSearchParams(params)), {
      status: 400,
    });
});
test('privacy subscriptions require unlock, confirmation, curated ID and explicit groups', async () => {
  const f = fixtureFetch(),
    body = {
      action: 'privacy-list-add',
      sourceId: 'hagezi-lg',
      groups: [1],
      confirmed: true,
    };
  await assert.rejects(
    createPiholeClient({ url, fetchImpl: f.request }).act(body),
    { status: 403 },
  );
  const c = createPiholeClient({
    url,
    fetchImpl: f.request,
    writeEnabled: true,
  });
  for (const invalid of [
    { ...body, confirmed: false },
    { ...body, groups: [] },
    { ...body, sourceId: 'http://internal.example' },
    { ...body, groups: [999] },
  ])
    await assert.rejects(c.act(invalid), { status: 400 });
  assert.ok(f.calls.every((call) => call.method === 'GET'));
  await c.act(body);
  const sent = f.calls.find((call) => call.method === 'POST');
  assert.equal(sent.path, '/api/lists');
  assert.equal(sent.query, 'type=block');
  assert.deepEqual(sent.body.groups, [1]);
  assert.ok(sent.body.address.endsWith('/native.lgwebos.txt'));
  assert.equal((await c.read('overview')).data.blocking.blocking, 'disabled');
  const before = f.calls.filter((call) => call.method === 'POST').length;
  await assert.rejects(c.act(body), { status: 409 });
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, before);
});

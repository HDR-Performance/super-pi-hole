import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createRuntime } from '../server/runtime.mjs';
import { fixtureFetch } from './fixtures/pihole-fixture.mjs';
const password = 'test-only-long-admin-password';
async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'sph-runtime-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><h1>Fixture</h1>');
  const api = fixtureFetch();
  const server = createRuntime({ publicOrigin: 'http://app.example', password, dataPath: join(directory, 'review.sqlite'), staticDir: directory, pihole: { url: 'http://pihole.example', fetchImpl: api.request, writeEnabled: true }, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Node fetch normalizes Host. Use a real HTTP request to exercise hostile Host cases.
  const call = (path, opts = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(base + path, { method: opts.method ?? 'GET', headers: { Host: 'app.example', ...(opts.method ? { Origin: 'http://app.example' } : {}), ...opts.headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])) })));
    });
    req.on('error', reject); req.end(opts.body);
  });
  const login = () => call('/session-api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  return { call, login, api, directory };
}
test('server rejects missing or placeholder administrator credentials at startup', () => {
  for (const password of ['', 'short', 'CHANGE_ME_TO_A_LONG_PASSWORD']) assert.throws(() => createRuntime({ publicOrigin: 'http://localhost:8080', password }));
});

test('preview identity is visible before login without changing installed authentication', async t => {
  const normal = await fixture(t);
  assert.equal((await (await normal.call('/session-api/status')).json()).synthetic, false);
  const preview = await fixture(t, { synthetic: true });
  const state = await (await preview.call('/session-api/status')).json();
  assert.equal(state.synthetic, true);
  assert.equal(state.authenticated, false);
  assert.equal((await preview.call('/live-api/overview')).status, 401);
});
test('sign-in protects live and review data; cookie and security headers are present', async t => {
  const { call, login } = await fixture(t);
  assert.equal((await call('/live-api/overview')).status, 401);
  assert.equal((await call('/review-api/state')).status, 401);
  const response = await login(), cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const state = await call('/review-api/state', { headers: { Cookie: cookie } });
  assert.equal(state.status, 200); assert.equal((await state.json()).revision, 0);
  assert.match(state.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const live = await call('/live-api/overview', { headers: { Cookie: cookie } });
  assert.equal((await live.json()).data.summary.queries.total, 250);
});

test('family routes require authentication and same-origin confirmation; saves never change global blocking', async t => {
  const { call, login, api } = await fixture(t);
  assert.equal((await call('/live-api/family/state')).status, 401);
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const config = { version: 1, paused: false, detailDays: 30, profiles: [{ groupId: 1, name: 'Family', timezone: 'UTC', blocked: ['reddit'], schedules: [] }] };
  assert.equal((await call('/live-api/family/save', { method: 'POST', headers: { ...headers, Origin: 'http://evil.example' }, body: JSON.stringify({ revision: 0, config, confirmed: true }) })).status, 403);
  assert.equal((await call('/live-api/family/save', { method: 'POST', headers, body: JSON.stringify({ revision: 0, config }) })).status, 400);
  const saved = await call('/live-api/family/save', { method: 'POST', headers, body: JSON.stringify({ revision: 0, config, confirmed: true }) });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).status, 'applied');
  const snapshot = await (await call('/live-api/family/state', { headers })).json();
  assert.equal(snapshot.config.profiles[0].name, 'Family'); assert.ok(snapshot.unread);
  assert.equal(api.calls.some(c => c.path === '/api/dns/blocking' && c.method !== 'GET'), false);
  assert.equal(api.calls.some(c => c.path === '/api/config' && c.method !== 'GET'), false);
});
test('wrong hosts and cross-origin changes are rejected even when authenticated', async t => {
  const { call, login, api } = await fixture(t);
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/', { headers: { Host: 'evil.example' } })).status, 403);
  const post = { method: 'POST', headers: { Cookie: cookie, Origin: 'http://evil.example', 'Content-Type': 'application/json', 'X-Super-Pihole-Review': '1' }, body: JSON.stringify({ action: 'blocking', blocking: true, timer: null, confirmed: true }) };
  assert.equal((await call('/live-api/action', post)).status, 403);
  assert.equal(api.calls.length, 0);
});
test('same-origin authenticated review save and live mutation work independently', async t => {
  const { call, login, api } = await fixture(t);
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Super-Pihole-Review': '1' };
  const current = await (await call('/review-api/state', { headers })).json();
  assert.equal((await call('/review-api/save', { method: 'POST', headers, body: JSON.stringify({ state: current.state, revision: 0 }) })).status, 200);
  assert.equal(api.calls.length, 0);
  assert.equal((await call('/live-api/action', { method: 'POST', headers, body: JSON.stringify({ action: 'blocking', blocking: false, timer: 300, confirmed: true }) })).status, 200);
  assert.deepEqual(api.calls[0].body, { blocking: false, timer: 300 });
});
test('logout revokes an existing cookie and static paths cannot expose files', async t => {
  const { call, login } = await fixture(t);
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/session-api/logout', { method: 'POST', headers: { Cookie: cookie } })).status, 200);
  assert.equal((await call('/live-api/status', { headers: { Cookie: cookie } })).status, 401);
  for (const path of ['/server/runtime.mjs', '/.local/review.sqlite', '/assets/%2e%2e%2fserver%2fruntime.mjs', '/package.json', '/.env']) assert.equal((await call(path)).status, 404);
});

test('authenticated GUI controls support short, custom, indefinite and resume actions', async t => {
  const { call, login, api } = await fixture(t);
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Super-Pihole-Review': '1' };
  for (const [blocking, timer] of [[false, 10], [false, 420], [false, null], [true, null]]) {
    const response = await call('/live-api/action', { method: 'POST', headers, body: JSON.stringify({ action: 'blocking', blocking, timer, confirmed: true }) });
    assert.equal(response.status, 200);
    assert.deepEqual(api.calls.at(-1).body, { blocking, timer });
    const state = (await (await call('/live-api/overview', { headers })).json()).data.blocking;
    assert.equal(state.blocking, blocking ? 'enabled' : 'disabled');
    if (timer === null) assert.equal(state.timer, null);
    else assert.ok(state.timer > 0 && state.timer <= timer);
  }
});
test('sessions expire and HTTPS origins receive Secure cookies', async t => {
  let now = Date.now();
  const { call, login } = await fixture(t, { clock: () => now });
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  now += 9 * 60 * 60 * 1000;
  assert.equal((await call('/live-api/status', { headers: { Cookie: cookie } })).status, 401);
  const secure = await fixture(t, { publicOrigin: 'https://app.example' });
  const response = await secure.call('/session-api/login', { method: 'POST', headers: { Origin: 'https://app.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.match(response.headers.get('set-cookie'), /; Secure/);
});
test('repeated incorrect passwords are rate-limited', async t => {
  const { call } = await fixture(t);
  const post = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) };
  for (let i = 0; i < 10; i++) assert.equal((await call('/session-api/login', post)).status, 401);
  assert.equal((await call('/session-api/login', post)).status, 429);
});

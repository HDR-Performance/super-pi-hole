// Real source-built FTL acceptance checks; synthetic CI containers only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const origin = 'http://127.0.0.1:20721';
let cookie;
async function api(path, body) {
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Super-Pihole-Review': '1', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  assert.ok(response.ok, path + ': ' + JSON.stringify(value));
  if (path === '/session-api/login') cookie = response.headers.get('set-cookie').split(';')[0];
  return value;
}
const act = body => api('/live-api/action', { ...body, confirmed: true });
const dns = (domain, client = '127.0.0.2', type = 'A') => execFileSync('docker', ['exec', 'sph-ci-dns', 'dig', '+short', '+time=2', '+tries=1', '-b', client, '@127.0.0.1', domain, type], { encoding: 'utf8' }).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check, message) {
  for (let i = 0; i < 20; i++) { if (await check()) return; await sleep(500); }
  assert.fail(message);
}
await api('/session-api/login', { password: 'ci-only-long-test-password' });
await act({ action: 'client-assign', client: '127.0.0.2', groups: [1], expected: null });
await eventually(() => dns('www.youtube.com') === '192.0.2.44', 'Baseline should allow synthetic YouTube endpoint.');
let state = await api('/live-api/family/state');
assert.equal(state.config.paused, false);
assert.deepEqual(state.config.profiles, []);
async function save(config) {
  // Refresh the revision; no overlap with the server's 30-second scheduler.
  await eventually(async () => { state = await api('/live-api/family/state'); return !state.busy; }, 'Family worker stayed busy.');
  state = await api('/live-api/family/save', { confirmed: true, revision: state.revision, config });
  assert.equal(state.status, 'applied', JSON.stringify(state));
}
const profile = { groupId: 1, name: 'CI child', timezone: 'UTC', blocked: ['youtube'], schedules: [] };
const config = { version: 1, paused: false, detailDays: 30, profiles: [profile] };
await save(config);
await eventually(() => dns('www.youtube.com') === '0.0.0.0', 'YouTube rule did not block assigned client.');
assert.equal(dns('www.youtube.com', '127.0.0.1'), '192.0.2.44', 'Family policy must not affect Default clients.');
profile.blocked = [];
const time = offset => new Date(Date.now() + offset * 60000).toISOString().slice(11, 16);
profile.schedules = [{ id: 'ci-window', enabled: true, mode: 'block-during', days: [0,1,2,3,4,5,6], start: time(-5), end: time(5), services: [], domains: ['family.test'] }];
await save(config);
await eventually(() => dns('family.test') === '0.0.0.0', 'Scheduled domain did not block.');
assert.equal(dns('family.test', '127.0.0.2', 'AAAA'), '::', 'Scheduled block must also cover AAAA.');
assert.equal(dns('www.youtube.com'), '192.0.2.44', 'Removing the platform block should restore DNS.');
config.paused = true;
await save(config);
await eventually(() => dns('allowed.test') === '0.0.0.0', 'Family master DNS pause did not apply.');
assert.equal(dns('allowed.test', '127.0.0.1'), '192.0.2.42');
await act({ action: 'domain-add', type: 'allow', kind: 'exact', domain: 'allowed.test', enabled: true, groups: [1], comment: 'CI allow priority' });
await eventually(() => dns('allowed.test') === '192.0.2.42', 'Native allowlist precedence must be retained.');
assert.ok(state.events.length > 0);
await api('/live-api/family/ack', { id: state.events[0].id });
// Engine-owned timer must resume even without a browser.
const blockingState = async () => (await api('/live-api/overview')).data.blocking;
await act({ action: 'blocking', blocking: false, timer: 2 });
assert.equal((await blockingState()).blocking, 'disabled');
await eventually(async () => (await blockingState()).blocking === 'enabled', 'Timed blocking did not resume.');
await act({ action: 'blocking', blocking: false, timer: null });
assert.equal((await blockingState()).blocking, 'disabled');
await act({ action: 'blocking', blocking: true, timer: null });
const settings = await api('/live-api/settings');
const field = settings.fields.find(row => row.path === 'dns.domainNeeded');
assert.equal(field.editable, true, 'Real engine metadata must expose the DNS setting.');
await act({ action: 'settings-save', changes: [{ path: field.path, expected: field.value, value: !field.value }] });
await act({ action: 'settings-save', changes: [{ path: field.path, expected: !field.value, value: field.value }] });
// Persistence across controller restart without changing household fixtures.
execFileSync('docker', ['restart', 'sph-ci-ui'], { stdio: 'inherit' });
await eventually(async () => { try { return (await fetch(origin + '/healthz')).ok; } catch { return false; } }, 'Controller failed to restart.');
cookie = null;
await api('/session-api/login', { password: 'ci-only-long-test-password' });
state = await api('/live-api/family/state');
if (state.status === 'attention') {
  state = await api('/live-api/family/retry', {
    confirmed: true,
    acknowledgement: 'RECONCILE MANAGED RULES',
    revision: state.revision,
  });
}
assert.equal(state.config.paused, true);
assert.equal(state.config.profiles[0].name, 'CI child');
await save({ version: 1, paused: false, detailDays: 30, profiles: [] });
await eventually(() => dns('family.test') === '192.0.2.43', 'Removing profile must remove only controller-owned rules.');
assert.equal(dns('blocked.test', '127.0.0.1'), '0.0.0.0', 'Original deny rule must remain.');
console.log('Real FTL family group isolation, platform toggle, schedule, IPv6, master pause, allow precedence, timed resume, typed settings and persistence passed.');

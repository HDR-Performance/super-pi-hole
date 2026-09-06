import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  familyDefaults,
  socialServices,
  validateFamily,
  compileFamily,
  duringSchedule,
  inspectionUrl,
} from '../lib/family-dns.mjs';
import { createFamilyService } from '../server/family-service.mjs';
import { createPiholeClient } from '../server/pihole-service.mjs';
import { fixtureFetch } from './fixtures/pihole-fixture.mjs';

const profile = () => ({
  groupId: 1,
  name: 'Children',
  timezone: 'America/Los_Angeles',
  blocked: ['youtube'],
  schedules: [],
});
const config = () => ({ ...familyDefaults(), profiles: [profile()] });
const schedule = () => ({
  id: 'night',
  enabled: true,
  mode: 'block-during',
  days: [1],
  start: '21:00',
  end: '07:00',
  services: ['discord'],
  domains: ['example.com'],
});
function engine() {
  const api = fixtureFetch();
  return {
    api,
    client: createPiholeClient({
      url: 'http://pihole.example',
      writeEnabled: true,
      fetchImpl: api.request,
    }),
  };
}

test('family settings reject Default/all-network group and unsafe inputs', () => {
  assert.deepEqual(validateFamily(familyDefaults()), familyDefaults());
  for (const edit of [
    (c) => (c.profiles[0].groupId = 0),
    (c) => (c.profiles[0].timezone = 'nonsense'),
    (c) => (c.detailDays = 31),
    (c) => c.profiles[0].blocked.push('unknown'),
    (c) => c.profiles.push(profile()),
    (c) => (c.profiles[0].name = '\u0000'),
  ]) {
    const c = config();
    edit(c);
    assert.throws(() => validateFamily(c));
  }
  for (const domain of [
    'https://site.example',
    '.*',
    'example.com/path',
    '__proto__',
    '-bad.example',
  ]) {
    const c = config();
    c.profiles[0].schedules = [{ ...schedule(), domains: [domain] }];
    assert.throws(() => validateFamily(c));
  }
});
test('overnight windows use the starting weekday and are end-exclusive', () => {
  const s = schedule();
  assert.equal(
    duringSchedule(s, 'UTC', Date.parse('2026-09-07T21:00:00Z')),
    true,
  );
  assert.equal(
    duringSchedule(s, 'UTC', Date.parse('2026-09-08T06:59:59Z')),
    true,
  );
  assert.equal(
    duringSchedule(s, 'UTC', Date.parse('2026-09-08T07:00:00Z')),
    false,
  );
  assert.equal(
    duringSchedule(s, 'UTC', Date.parse('2026-09-07T06:00:00Z')),
    false,
  );
});
test('DST repeated hours and access windows follow the selected local timezone', () => {
  const s = { ...schedule(), days: [0], start: '01:00', end: '02:00' };
  for (const hour of ['08', '09'])
    assert.equal(
      duringSchedule(
        s,
        'America/Los_Angeles',
        Date.parse(`2026-11-01T${hour}:30:00Z`),
      ),
      true,
    );
  const c = config();
  c.profiles[0].blocked = [];
  c.profiles[0].timezone = 'UTC';
  c.profiles[0].schedules = [{ ...s, mode: 'allow-during' }];
  assert.equal(compileFamily(c, Date.parse('2026-09-06T01:30:00Z')).length, 0);
  assert.equal(compileFamily(c, Date.parse('2026-09-06T02:00:00Z')).length, 2);
});
test('platform suffixes are anchored and merged across groups without matching impostor domains', () => {
  const c = config();
  c.profiles.push({ ...profile(), groupId: 2 });
  const rules = compileFamily(c, Date.now());
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].groups, [1, 2]);
  const regex = new RegExp(rules[0].domain);
  assert.equal(regex.test('www.youtube.com'), true);
  assert.equal(regex.test('notyoutube.com'), false);
  assert.equal(regex.test('youtube.com.evil.example'), false);
  for (const s of socialServices) {
    const local = config();
    local.profiles[0].blocked = [s.id];
    const pattern = new RegExp(compileFamily(local, Date.now())[0].domain);
    for (const d of s.domains) assert.ok(pattern.test(d));
  }
});
test('master pause applies only to registered groups and does not erase permanent blocks', () => {
  const c = config();
  c.paused = true;
  const rules = compileFamily(c, Date.now());
  assert.equal(rules.length, 2);
  assert.deepEqual(rules.find((r) => r.domain === '^.+$').groups, [1]);
});
test('site inspection links reject schemes, credentials, control characters, paths and ports', () => {
  assert.equal(inspectionUrl('www.example.com'), 'https://www.example.com/');
  for (const domain of [
    'javascript:alert(1)',
    'x@evil.example',
    'foo.example:81',
    'foo.example/path',
    'foo.example\n',
    'localhost',
    'a..com',
  ])
    assert.equal(inspectionUrl(domain), null);
});
test('engine applies and verifies family rules, then removes only owned rules', async () => {
  const { client } = engine();
  const desired = compileFamily(config(), Date.now());
  const first = await client.syncFamily({
    desired,
    expected: [],
    groupIds: [1],
  });
  assert.equal(first.changes, 1);
  const stable = await client.syncFamily({
    desired,
    expected: first.rules,
    groupIds: [1],
  });
  assert.equal(stable.changes, 0);
  await client.syncFamily({ desired: [], expected: first.rules, groupIds: [] });
  assert.deepEqual(
    (await client.read('domains')).domains.map((r) => r.domain),
    ['telemetry.example'],
  );
});
test('engine rejects unowned collisions, drift and disabled groups before mutations', async () => {
  const { api, client } = engine();
  const desired = compileFamily(config(), Date.now());
  await client.act({
    action: 'domain-add',
    domain: desired[0].domain,
    type: 'deny',
    kind: 'regex',
    groups: [1],
    comment: 'User owned',
    confirmed: true,
  });
  const before = api.calls.filter((c) => c.method !== 'GET').length;
  await assert.rejects(
    client.syncFamily({ desired, expected: [], groupIds: [1] }),
    /outside family/,
  );
  await assert.rejects(
    client.syncFamily({ desired, expected: [], groupIds: [999] }),
    /missing or disabled/,
  );
  assert.equal(api.calls.filter((c) => c.method !== 'GET').length, before);
  const other = engine();
  const first = await other.client.syncFamily({
    desired,
    expected: [],
    groupIds: [1],
  });
  const row = (await other.client.read('domains')).domains.find(
    (r) => r.domain === desired[0].domain,
  );
  await other.client.act({
    action: 'domain-edit',
    ...row,
    nextType: 'deny',
    enabled: false,
    expected: row,
    confirmed: true,
  });
  await assert.rejects(
    other.client.syncFamily({ desired, expected: first.rules, groupIds: [1] }),
    /outside this controller/,
  );
});
test('persistent controller validates confirmation, stale revision and resumes from saved settings', async (t) => {
  const { client } = engine();
  const path = join(
    mkdtempSync(join(tmpdir(), 'sph-family-')),
    'family.sqlite',
  );
  let service = createFamilyService({ path, client });
  t.after(() => service.close());
  await assert.rejects(
    service.save({ revision: 0, config: config() }),
    /Confirm/,
  );
  const saved = await service.save({
    revision: 0,
    config: config(),
    confirmed: true,
  });
  assert.equal(saved.status, 'applied');
  assert.equal(saved.blocking, 'disabled');
  assert.ok(saved.events.some((e) => e.severity === 'warning'));
  await assert.rejects(
    service.save({ revision: 0, config: config(), confirmed: true }),
    /changed/,
  );
  await service.close();
  service = createFamilyService({ path, client });
  await service.tick();
  assert.equal(service.snapshot().config.profiles[0].name, 'Children');
  assert.equal(service.snapshot().status, 'applied');
});
test('schedules reconcile without a browser and family failure stops automatic retries', async (t) => {
  let now = Date.parse('2026-09-07T20:59:00Z');
  const { api, client } = engine();
  const service = createFamilyService({
    path: ':memory:',
    client,
    clock: () => now,
  });
  t.after(() => service.close());
  const c = config();
  c.profiles[0].blocked = [];
  c.profiles[0].timezone = 'UTC';
  c.profiles[0].schedules = [schedule()];
  await service.save({ revision: 0, config: c, confirmed: true });
  assert.equal(service.snapshot().rules.length, 0);
  now += 60000;
  await service.tick();
  assert.equal(service.snapshot().rules.length, 2);
  now = Date.parse('2026-09-08T07:00:00Z');
  await service.tick();
  assert.equal(service.snapshot().rules.length, 0);
  const bad = config();
  bad.profiles[0].groupId = 999;
  const failed = await service.save({
    revision: 1,
    config: bad,
    confirmed: true,
  });
  assert.equal(failed.status, 'attention');
  const count = api.calls.length;
  await service.tick();
  await service.tick();
  assert.equal(api.calls.length, count);
});
test('notifications prune at 30 days; daily control counts at one year, without hostnames', async (t) => {
  let now = Date.parse('2026-09-05T12:00:00Z');
  const { client } = engine();
  const service = createFamilyService({
    path: ':memory:',
    client,
    clock: () => now,
  });
  t.after(() => service.close());
  await service.save({ revision: 0, config: config(), confirmed: true });
  const state = service.snapshot();
  service.acknowledge(state.events[0].id);
  assert.equal(service.snapshot().unread, state.unread - 1);
  assert.equal(JSON.stringify(state.daily).includes('Children'), false);
  now += 30 * 86400000;
  assert.equal(service.snapshot().events.length, 0);
  assert.ok(service.snapshot().daily.length);
  now += 366 * 86400000;
  assert.equal(service.snapshot().daily.length, 0);
});
test('a crash during apply becomes attention on restart and never replays automatically', async (t) => {
  const { api, client } = engine();
  const path = join(
    mkdtempSync(join(tmpdir(), 'sph-family-')),
    'family.sqlite',
  );
  const first = createFamilyService({ path, client });
  await first.close();
  const db = new DatabaseSync(path);
  const row = JSON.parse(
    db.prepare('SELECT body FROM family_state').get().body,
  );
  row.status = 'applying';
  row.config = config();
  db.prepare('UPDATE family_state SET body=?').run(JSON.stringify(row));
  db.close();
  const recovered = createFamilyService({ path, client });
  t.after(() => recovered.close());
  await recovered.tick();
  assert.equal(recovered.snapshot().status, 'attention');
  assert.equal(api.calls.length, 0);
});

test('partial unknown writes are not replayed; explicit recovery reads current owned state', async (t) => {
  const api = fixtureFetch();
  let rejectOnce = true;
  const client = createPiholeClient({
    url: 'http://pihole.example',
    writeEnabled: true,
    fetchImpl: async (url, init) => {
      const result = await api.request(url, init);
      if (
        rejectOnce &&
        init.method === 'POST' &&
        new URL(url).pathname.startsWith('/api/domains/')
      ) {
        rejectOnce = false;
        throw Error('Connection lost after write');
      }
      return result;
    },
  });
  const service = createFamilyService({ path: ':memory:', client });
  t.after(() => service.close());
  const failed = await service.save({
    revision: 0,
    config: config(),
    confirmed: true,
  });
  assert.equal(failed.status, 'attention');
  const count = api.calls.length;
  await service.tick();
  assert.equal(api.calls.length, count);
  await assert.rejects(
    service.retry({ revision: 1, confirmed: true }),
    /explicitly confirm/,
  );
  const result = await service.retry({
    revision: 1,
    confirmed: true,
    acknowledgement: 'RECONCILE MANAGED RULES',
  });
  assert.equal(result.status, 'applied');
  assert.equal(
    api.calls.filter(
      (c) => c.path.startsWith('/api/domains/') && c.method === 'POST',
    ).length,
    1,
  );
});

test('read-only service cannot persist a live family policy or send writes', async (t) => {
  const api = fixtureFetch();
  const client = createPiholeClient({
    url: 'http://pihole.example',
    writeEnabled: false,
    fetchImpl: api.request,
  });
  const service = createFamilyService({ path: ':memory:', client });
  t.after(() => service.close());
  await assert.rejects(
    service.save({ revision: 0, config: config(), confirmed: true }),
    /locked/,
  );
  assert.equal(service.snapshot().revision, 0);
  assert.equal(api.calls.length, 0);
});

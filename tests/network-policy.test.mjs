import test from 'node:test';
import assert from 'node:assert/strict';
import { countryCodes, countries } from '../lib/countries.ts';
import {
  initialNetwork,
  validateNetwork,
  evaluateNetwork,
} from '../lib/network-policy.ts';
import { assignDevice } from '../lib/parental-policy.ts';
const scenario = (patch = {}) => ({
  deviceId: 'printer',
  domain: 'telemetry.example',
  country: 'US',
  category: 'unknown',
  at: '2026-09-07T18:00:00Z',
  feedMatch: false,
  ...patch,
});
const rule = (action, target = { type: 'device', id: 'printer' }) => ({
  id: action,
  domain: 'telemetry.example',
  action,
  target,
  enabled: true,
});
test('complete CLDR country/territory selector contains 257 distinct regular codes', () => {
  assert.equal(countryCodes.length, 257);
  assert.equal(new Set(countryCodes).size, 257);
  for (const c of ['US', 'CN', 'RU', 'CA', 'XK', 'BQ', 'AX'])
    assert.ok(countryCodes.includes(c));
  assert.ok(!countryCodes.includes('ZZ'));
  assert.equal(countries.length, 257);
});
test('initial network validates with no default country restrictions', () => {
  const s = initialNetwork();
  assert.deepEqual(validateNetwork(s), s);
  assert.equal(s.countries.enabled, false);
  assert.deepEqual(s.countries.blocked, []);
  assert.equal(s.settings.timezone, 'America/Los_Angeles');
});
test('country policy is scoped to devices and groups, including unknown behavior', () => {
  const s = initialNetwork();
  s.countries = {
    enabled: true,
    blocked: ['CN'],
    unknown: 'block',
    target: { type: 'group', id: 'iot' },
  };
  assert.equal(
    evaluateNetwork(s, scenario({ country: 'CN' })).source,
    'country',
  );
  assert.equal(
    evaluateNetwork(s, scenario({ country: 'ZZ' })).source,
    'country',
  );
  assert.notEqual(
    evaluateNetwork(s, scenario({ deviceId: 'tablet', country: 'CN' })).source,
    'country',
  );
  assert.equal(evaluateNetwork(s, scenario()).action, 'allow');
});
test('domain matches respect label boundaries and explicit deny wins over allow', () => {
  const s = initialNetwork();
  s.rules = [rule('block'), rule('allow')];
  assert.equal(
    evaluateNetwork(s, scenario({ domain: 'sub.telemetry.example' })).action,
    'block',
  );
  assert.equal(
    evaluateNetwork(s, scenario({ domain: 'nottelemetry.example' })).action,
    'allow',
  );
});
test('domain approval overrides an ordinary assumed feed match but never known malware', () => {
  const s = initialNetwork();
  assert.equal(
    evaluateNetwork(s, scenario({ feedMatch: true })).source,
    'blocklist',
  );
  s.rules = [rule('allow')];
  assert.equal(
    evaluateNetwork(s, scenario({ feedMatch: true })).action,
    'allow',
  );
  assert.equal(
    evaluateNetwork(s, scenario({ feedMatch: true, category: 'malware' }))
      .action,
    'block',
  );
});
test('domain approval cannot bypass device pause or country restriction', () => {
  const s = initialNetwork();
  s.rules = [rule('allow')];
  s.devices.find((d) => d.id === 'printer').paused = true;
  assert.equal(evaluateNetwork(s, scenario()).source, 'device');
  s.devices.find((d) => d.id === 'printer').paused = false;
  s.countries.enabled = true;
  s.countries.blocked = ['US'];
  assert.equal(evaluateNetwork(s, scenario()).source, 'country');
});
test('network domain approval participates in parental categories while bedtime still wins', () => {
  const s = initialNetwork();
  s.rules = [rule('allow', { type: 'device', id: 'tablet' })];
  assert.equal(
    evaluateNetwork(s, scenario({ deviceId: 'tablet', category: 'social' }))
      .action,
    'allow',
  );
  assert.equal(
    evaluateNetwork(
      s,
      scenario({
        deviceId: 'tablet',
        category: 'social',
        at: '2026-09-08T05:00:00Z',
      }),
    ).source,
    'parental',
  );
});
test('scoped allowed-hours windows block outside the window and include subdomains', () => {
  const s = initialNetwork();
  s.schedules = [
    {
      id: 'schedule',
      name: 'Printer hours',
      domains: ['telemetry.example'],
      target: { type: 'device', id: 'printer' },
      timezone: 'UTC',
      mode: 'allow-during',
      window: { enabled: true, start: '18:00', end: '19:00', days: [1] },
    },
  ];
  assert.equal(evaluateNetwork(s, scenario()).action, 'allow');
  assert.equal(
    evaluateNetwork(
      s,
      scenario({ at: '2026-09-07T19:00:00Z', domain: 'sub.telemetry.example' }),
    ).source,
    'schedule',
  );
  s.schedules[0].window.enabled = false;
  assert.equal(
    evaluateNetwork(s, scenario({ at: '2026-09-07T19:00:00Z' })).action,
    'allow',
  );
});
test('overnight website schedule follows starting weekday and selected time zone', () => {
  const s = initialNetwork();
  s.schedules = [
    {
      id: 'night',
      name: 'Night',
      domains: ['telemetry.example'],
      target: { type: 'all', id: '' },
      timezone: 'America/Los_Angeles',
      mode: 'block-during',
      window: { enabled: true, start: '22:00', end: '07:00', days: [1] },
    },
  ];
  assert.equal(
    evaluateNetwork(s, scenario({ at: '2026-09-08T13:59:00Z' })).source,
    'schedule',
  );
  assert.equal(
    evaluateNetwork(s, scenario({ at: '2026-09-08T14:00:00Z' })).action,
    'allow',
  );
});
test('content packs only affect selected family profiles and respect domain approval', () => {
  const s = initialNetwork(),
    p = s.parental.profiles[0];
  p.blockedCategories = [];
  p.bedtime.enabled = false;
  s.lists.parentalProfiles = [p.id];
  assert.equal(
    evaluateNetwork(s, scenario({ deviceId: 'tablet', category: 'adult' }))
      .source,
    'parental-pack',
  );
  assert.equal(
    evaluateNetwork(s, scenario({ category: 'adult' })).action,
    'allow',
  );
  p.allow = ['telemetry.example'];
  assert.equal(
    evaluateNetwork(s, scenario({ deviceId: 'tablet', category: 'adult' }))
      .action,
    'allow',
  );
});
test('new review devices can be assigned to parental profiles', () => {
  const s = initialNetwork();
  s.devices.push({
    id: 'new-device',
    name: 'Test printer',
    address: '192.0.2.100',
    kind: 'printer',
    groupId: 'iot',
    paused: false,
  });
  s.parental = assignDevice(
    s.parental,
    s.parental.profiles[0].id,
    'new-device',
    true,
    s.devices.map((d) => d.id),
  );
  assert.doesNotThrow(() => validateNetwork(s));
  assert.equal(
    evaluateNetwork(s, scenario({ deviceId: 'new-device', category: 'adult' }))
      .source,
    'parental',
  );
});
test('invalid imports and dangling targets are rejected', () => {
  for (const mutate of [
    (s) => (s.countries.blocked = ['XX']),
    (s) => (s.rules = [rule('block', { type: 'device', id: 'missing' })]),
    (s) => (s.devices[0].address = s.devices[1].address),
    (s) => (s.settings.piholeUrl = 'javascript:alert(1)'),
    (s) => (s.settings.piholeUrl = 'http://user:pass@example.com/'),
    (s) => (s.settings.timezone = 'not/a/zone'),
    (s) => (s.lists.parentalProfiles = ['missing']),
    (s) => (s.groups = []),
  ]) {
    const s = initialNetwork();
    mutate(s);
    assert.throws(() => validateNetwork(s));
  }
  for (const bad of [null, {}, [], 42, 'text'])
    assert.throws(() => validateNetwork(bad));
});
test('invalid scenarios are rejected without a DNS request', () => {
  for (const patch of [
    { deviceId: 'missing' },
    { country: 'XY' },
    { category: 'not-a-category' },
    { at: 'bad' },
    { feedMatch: 'yes' },
    { domain: 'https://example.com/path' },
  ])
    assert.throws(() => evaluateNetwork(initialNetwork(), scenario(patch)));
});
test('review evaluation toggle affects only policy evaluation', () => {
  const s = initialNetwork();
  s.evaluationEnabled = false;
  s.devices[0].paused = true;
  assert.equal(
    evaluateNetwork(s, scenario({ deviceId: 'tablet', category: 'malware' }))
      .source,
    'evaluation',
  );
});

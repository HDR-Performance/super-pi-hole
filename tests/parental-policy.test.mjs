import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProfile,
  initialDraft,
  normalizeDomain,
  matches,
  inWindow,
  evaluate,
  validateDraft,
  assignDevice,
  applyPreset,
} from '../lib/parental-policy.ts';

const noon = new Date('2026-09-04T19:00:00Z'); // Friday noon in Phoenix.
const profile = () => createProfile('test', 'Example');
test('domain normalization, suffix boundaries, and hostile input', () => {
  assert.equal(normalizeDomain(' SCHOOL.Example. '), 'school.example');
  assert.ok(matches('sub.school.example', 'school.example'));
  assert.equal(matches('notschool.example', 'school.example'), false);
  for (const input of [
    'https://school.example',
    'a.example/path',
    '*.example',
    '192.0.2.1',
    'bad..example',
    '-bad.example',
    'a.example:53',
    'a.example?x=1',
    'a.example\\evil',
    'localhost',
  ])
    assert.throws(() => normalizeDomain(input));
});
test('child, teen, and adult presets are independently editable', () => {
  assert.ok(profile().blockedCategories.includes('adult'));
  assert.equal(createProfile('t', 't', 'adult').safeSearch, false);
  const p = profile();
  p.allow = ['school.example'];
  p.devices = ['tablet'];
  const changed = applyPreset(p, 'adult');
  assert.deepEqual(changed.allow, p.allow);
  assert.deepEqual(changed.devices, p.devices);
  assert.notDeepEqual(changed.blockedCategories, p.blockedCategories);
});
test('overnight window uses start weekday; end is exclusive', () => {
  const w = { enabled: true, days: [5], start: '22:00', end: '07:00' };
  assert.ok(inWindow(w, new Date('2026-09-05T06:00:00Z'), 'America/Phoenix'));
  assert.ok(inWindow(w, new Date('2026-09-05T13:59:00Z'), 'America/Phoenix'));
  assert.equal(
    inWindow(w, new Date('2026-09-05T14:00:00Z'), 'America/Phoenix'),
    false,
  );
  assert.equal(
    inWindow(w, new Date('2026-09-04T13:00:00Z'), 'America/Phoenix'),
    false,
  );
});
test('same-day windows and disabled windows', () => {
  const w = { enabled: true, days: [5], start: '11:00', end: '13:00' };
  assert.ok(inWindow(w, noon, 'America/Phoenix'));
  assert.equal(
    inWindow({ ...w, enabled: false }, noon, 'America/Phoenix'),
    false,
  );
});
test('DST uses local wall time across repeated hours', () => {
  const w = { enabled: true, days: [0], start: '01:00', end: '02:00' };
  assert.ok(inWindow(w, new Date('2026-11-01T05:30:00Z'), 'America/New_York'));
  assert.ok(inWindow(w, new Date('2026-11-01T06:30:00Z'), 'America/New_York'));
  assert.equal(
    inWindow(w, new Date('2026-11-01T07:00:00Z'), 'America/New_York'),
    false,
  );
});
test('category blocks, unknowns and approved-sites-only mode', () => {
  const p = profile();
  assert.equal(evaluate(p, 'sample.example', 'adult', noon).action, 'block');
  assert.equal(evaluate(p, 'sample.example', 'unknown', noon).action, 'allow');
  p.approvedOnly = true;
  assert.equal(evaluate(p, 'sample.example', 'unknown', noon).action, 'block');
  p.allow = ['sample.example'];
  assert.equal(
    evaluate(p, 'sub.sample.example', 'adult', noon).action,
    'allow',
  );
});
test('custom deny wins over permanent allow; bedtime wins over permanent allow', () => {
  const p = profile();
  p.allow = ['school.example'];
  p.deny = ['school.example'];
  assert.equal(evaluate(p, 'school.example', 'unknown', noon).action, 'block');
  p.deny = [];
  assert.equal(
    evaluate(p, 'school.example', 'unknown', new Date('2026-09-05T05:00:00Z'))
      .action,
    'block',
  );
});
test('homework blocks entertainment but not unrelated categories', () => {
  const p = profile();
  p.homework = { enabled: true, days: [5], start: '11:00', end: '13:00' };
  assert.equal(evaluate(p, 'play.example', 'gaming', noon).action, 'block');
  assert.equal(evaluate(p, 'school.example', 'unknown', noon).action, 'allow');
});
test('temporary approvals start and expire exactly, overriding ordinary restrictions', () => {
  const p = profile();
  p.deny = ['site.example'];
  p.grants = [
    {
      id: 'g',
      domain: 'site.example',
      startsAt: +noon,
      expiresAt: +noon + 60000,
    },
  ];
  assert.equal(
    evaluate(p, 'site.example', 'adult', new Date(+noon - 1)).action,
    'block',
  );
  assert.equal(evaluate(p, 'site.example', 'adult', noon).action, 'allow');
  assert.equal(
    evaluate(p, 'site.example', 'adult', new Date(+noon + 60000)).action,
    'block',
  );
});
test('security and pause cannot be bypassed by temporary approval', () => {
  const p = profile();
  p.grants = [
    {
      id: 'g',
      domain: 'site.example',
      startsAt: +noon - 1,
      expiresAt: +noon + 60000,
    },
  ];
  assert.equal(evaluate(p, 'site.example', 'malware', noon).action, 'block');
  p.pause = { startsAt: +noon, expiresAt: +noon + 60000 };
  assert.equal(evaluate(p, 'site.example', 'unknown', noon).action, 'block');
  assert.equal(
    evaluate(p, 'site.example', 'unknown', new Date(+noon + 60000)).action,
    'allow',
  );
});
test('SafeSearch and YouTube remain restricted with approval', () => {
  const p = profile();
  p.allow = ['google.com'];
  assert.deepEqual(
    evaluate(p, 'www.google.com', 'unknown', noon).restrictions,
    ['SafeSearch'],
  );
  assert.equal(evaluate(p, 'evilgoogle.com', 'unknown', noon).action, 'allow');
  assert.equal(
    evaluate(p, 'www.youtube.com', 'unknown', noon).action,
    'restricted',
  );
});
test('device assignment is exclusive and does not mutate other drafts', () => {
  const d = initialDraft(),
    changed = assignDevice(d, 'shared-example', 'tablet', true);
  assert.deepEqual(changed.profiles[0].devices, []);
  assert.ok(changed.profiles[1].devices.includes('tablet'));
  assert.deepEqual(d.profiles[0].devices, ['tablet']);
  assert.throws(() => assignDevice(d, 'missing', 'tablet', true));
});
test('valid drafts round-trip and malformed drafts are rejected', () => {
  const d = initialDraft();
  assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(d))), d);
  const changes = [
    (d) => (d.profiles[0].timezone = 'Mars/Base'),
    (d) => (d.profiles[0].bedtime.end = d.profiles[0].bedtime.start),
    (d) => (d.profiles[0].name = ''),
    (d) => (d.profiles[0].bedtime.days = []),
    (d) => (d.profiles[0].allow = ['https://evil.example']),
    (d) => (d.profiles[0].blockedCategories = ['fake']),
    (d) => (d.profiles[1].devices = ['tablet']),
    (d) => (d.profiles[1].id = d.profiles[0].id),
    (d) => (d.profiles[0].safeSearch = 'true'),
    (d) => (d.profiles[0].pause = { startsAt: 0, expiresAt: Infinity }),
  ];
  for (const change of changes) {
    const copy = structuredClone(d);
    change(copy);
    assert.throws(() => validateDraft(copy));
  }
});
test('invalid simulator inputs fail intentionally', () => {
  assert.throws(() =>
    evaluate(profile(), 'example.com', 'unknown', new Date('invalid')),
  );
});

test('unassigning another profile device is a no-op', () => {
  const draft = initialDraft();
  assert.deepEqual(assignDevice(draft, 'child-example', 'tv', false), draft);
});

import {
  initialDraft,
  validateDraft,
  normalizeDomain,
  matches,
  inWindow,
  evaluate,
  categories,
} from './parental-policy.ts';
import type { Draft, Category, Window, Decision } from './parental-policy.ts';
import { countryCodes } from './countries.ts';

export type Device = {
  id: string;
  name: string;
  address: string;
  kind: 'tablet' | 'tv' | 'printer' | 'computer' | 'other';
  groupId: string;
  paused: boolean;
};
export type Target = { type: 'all' | 'device' | 'group'; id: string };
export type Rule = {
  id: string;
  domain: string;
  action: 'allow' | 'block';
  target: Target;
  enabled: boolean;
};
export type Schedule = {
  id: string;
  name: string;
  domains: string[];
  target: Target;
  window: Window;
  timezone: string;
  mode: 'block-during' | 'allow-during';
};
export type NetworkState = {
  version: 1;
  evaluationEnabled: boolean;
  groups: { id: string; name: string }[];
  devices: Device[];
  countries: {
    enabled: boolean;
    blocked: string[];
    unknown: 'allow' | 'block';
    target: Target;
  };
  rules: Rule[];
  schedules: Schedule[];
  parental: Draft;
  lists: {
    preset: 'balanced' | 'privacy' | 'compatibility';
    parentalProfiles: string[];
  };
  settings: {
    timezone: string;
    notifications: boolean;
    retentionDays: 0 | 7 | 30;
    piholeUrl: string;
  };
};
export type Scenario = {
  deviceId: string;
  domain: string;
  country: string;
  category: Category | 'unknown';
  at: string;
  feedMatch: boolean;
};
export type NetworkDecision = Decision & {
  source: string;
  profileId: string | null;
};
export function initialNetwork(): NetworkState {
  const parental = initialDraft();
  for (const profile of parental.profiles)
    profile.timezone = 'America/Los_Angeles';
  return {
    version: 1,
    evaluationEnabled: true,
    groups: [
      { id: 'family', name: 'Family' },
      { id: 'iot', name: 'Smart home & printers' },
      { id: 'trusted', name: 'Trusted devices' },
    ],
    devices: [
      {
        id: 'tablet',
        name: 'Family tablet',
        address: '192.0.2.22',
        kind: 'tablet',
        groupId: 'family',
        paused: false,
      },
      {
        id: 'tv',
        name: 'Living room TV',
        address: '192.0.2.21',
        kind: 'tv',
        groupId: 'family',
        paused: false,
      },
      {
        id: 'printer',
        name: 'Workshop printer',
        address: '192.0.2.20',
        kind: 'printer',
        groupId: 'iot',
        paused: false,
      },
    ],
    countries: {
      enabled: false,
      blocked: [],
      unknown: 'allow',
      target: { type: 'all', id: '' },
    },
    rules: [],
    schedules: [],
    parental,
    lists: { preset: 'balanced', parentalProfiles: [] },
    settings: {
      timezone: 'America/Los_Angeles',
      notifications: true,
      retentionDays: 7,
      piholeUrl: 'http://pi.hole/admin/',
    },
  };
}
const validZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
};
export function validateNetwork(input: unknown): NetworkState {
  const fail = (message = 'Invalid review settings.'): never => {
    throw new Error(message);
  };
  if (!input || typeof input !== 'object') return fail();
  const s = input as NetworkState;
  const text = (v: unknown, max = 80): v is string =>
    typeof v === 'string' && !!v.trim() && v.length <= max;
  const unique = (items: { id: string }[]) =>
    items.every((i) => i && text(i.id)) &&
    new Set(items.map((i) => i.id)).size === items.length;
  if (
    s.version !== 1 ||
    typeof s.evaluationEnabled !== 'boolean' ||
    !Array.isArray(s.groups) ||
    !s.groups.length ||
    s.groups.length > 30 ||
    !unique(s.groups) ||
    s.groups.some((g) => !text(g.name, 60))
  )
    return fail('Use 1–30 uniquely identified groups with names.');
  if (!Array.isArray(s.devices) || s.devices.length > 200 || !unique(s.devices))
    return fail('Use at most 200 uniquely identified devices.');
  for (const d of s.devices)
    if (
      !text(d.name, 60) ||
      !text(d.address, 80) ||
      !['tablet', 'tv', 'printer', 'computer', 'other'].includes(d.kind) ||
      !s.groups.some((g) => g.id === d.groupId) ||
      typeof d.paused !== 'boolean'
    )
      return fail('Check device names, addresses, and groups.');
  if (
    new Set(s.devices.map((d) => d.address.trim().toLowerCase())).size !==
    s.devices.length
  )
    return fail('Each device needs a distinct address or identifier.');
  const target = (t: Target) =>
    t &&
    typeof t.id === 'string' &&
    (t.type === 'all'
      ? t.id === ''
      : t.type === 'device'
        ? s.devices.some((d) => d.id === t.id)
        : t.type === 'group' && s.groups.some((g) => g.id === t.id));
  const list = (a: string[]) =>
    Array.isArray(a) &&
    a.length <= 500 &&
    new Set(a).size === a.length &&
    a.every((d) => typeof d === 'string' && normalizeDomain(d) === d);
  const c = s.countries;
  if (
    !c ||
    typeof c.enabled !== 'boolean' ||
    !Array.isArray(c.blocked) ||
    new Set(c.blocked).size !== c.blocked.length ||
    c.blocked.some((v) => !countryCodes.includes(v)) ||
    !['allow', 'block'].includes(c.unknown) ||
    !target(c.target)
  )
    return fail('Check country selections and scope.');
  if (
    !Array.isArray(s.rules) ||
    s.rules.length > 1000 ||
    !unique(s.rules) ||
    s.rules.some(
      (r) =>
        !list([r.domain]) ||
        !['allow', 'block'].includes(r.action) ||
        !target(r.target) ||
        typeof r.enabled !== 'boolean',
    )
  )
    return fail('Check domain rules and their targets.');
  if (
    !Array.isArray(s.schedules) ||
    s.schedules.length > 100 ||
    !unique(s.schedules)
  )
    return fail('Use at most 100 uniquely identified schedules.');
  for (const row of s.schedules) {
    const w = row.window;
    if (
      !text(row.name, 60) ||
      !list(row.domains) ||
      !row.domains.length ||
      !target(row.target) ||
      !text(row.timezone) ||
      !validZone(row.timezone) ||
      !['block-during', 'allow-during'].includes(row.mode) ||
      !w ||
      typeof w.enabled !== 'boolean' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end) ||
      w.start === w.end ||
      !Array.isArray(w.days) ||
      !w.days.length ||
      new Set(w.days).size !== w.days.length ||
      w.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    )
      return fail(
        'Schedules need domains, valid times, weekdays, a time zone, and a target.',
      );
  }
  validateDraft(
    s.parental,
    s.devices.map((d) => d.id),
  );
  if (
    !s.lists ||
    !['balanced', 'privacy', 'compatibility'].includes(s.lists.preset) ||
    !Array.isArray(s.lists.parentalProfiles) ||
    new Set(s.lists.parentalProfiles).size !==
      s.lists.parentalProfiles.length ||
    s.lists.parentalProfiles.some(
      (id) => !s.parental.profiles.some((p) => p.id === id),
    )
  )
    return fail('Choose a valid base preset and family-profile assignments.');
  const settings = s.settings;
  if (
    !settings ||
    !text(settings.timezone) ||
    !validZone(settings.timezone) ||
    typeof settings.notifications !== 'boolean' ||
    ![0, 7, 30].includes(settings.retentionDays) ||
    typeof settings.piholeUrl !== 'string' ||
    settings.piholeUrl.length > 300
  )
    return fail('Check review preferences.');
  const url = new URL(settings.piholeUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return fail(
      'Pi-hole link must be an HTTP(S) address without credentials, query, or fragment.',
    );
  return structuredClone(s);
}
export function targetMatches(target: Target, device: Device) {
  return (
    target.type === 'all' ||
    (target.type === 'device'
      ? target.id === device.id
      : target.id === device.groupId)
  );
}
export function evaluateNetwork(
  s: NetworkState,
  scenario: Scenario,
): NetworkDecision {
  const domain = normalizeDomain(scenario.domain),
    at = new Date(scenario.at),
    device = s.devices.find((d) => d.id === scenario.deviceId);
  if (
    !device ||
    !Number.isFinite(at.getTime()) ||
    (!countryCodes.includes(scenario.country) && scenario.country !== 'ZZ') ||
    !['unknown', ...categories.map((c) => c.id)].includes(scenario.category) ||
    typeof scenario.feedMatch !== 'boolean'
  )
    throw new Error(
      'Choose a device, valid UTC instant, country, and category for this synthetic test.',
    );
  const profile = s.parental.profiles.find((p) =>
    p.devices.includes(device.id),
  );
  const answer = (
    action: Decision['action'],
    source: string,
    reason: string,
    restrictions: string[] = [],
  ): NetworkDecision => ({
    action,
    source,
    reason,
    restrictions,
    profileId: profile?.id ?? null,
  });
  if (!s.evaluationEnabled)
    return answer(
      'allow',
      'evaluation',
      'Policy evaluation is paused for this review. Live DNS is unchanged.',
    );
  if (device.paused)
    return answer(
      'block',
      'device',
      'This device is paused in the review policy.',
    );
  if (scenario.category === 'malware')
    return answer(
      'block',
      'blocklist',
      'The test assumes a known malware/phishing classification.',
    );
  const applicable = s.rules.filter(
    (r) =>
      r.enabled && targetMatches(r.target, device) && matches(domain, r.domain),
  );
  if (applicable.some((r) => r.action === 'block'))
    return answer('block', 'domain', 'A matching blocked-domain rule applies.');
  const explicitAllow = applicable.some((r) => r.action === 'allow');
  const c = s.countries;
  if (
    c.enabled &&
    targetMatches(c.target, device) &&
    (c.blocked.includes(scenario.country) ||
      (scenario.country === 'ZZ' && c.unknown === 'block'))
  )
    return answer(
      'block',
      'country',
      'The assumed DNS answer location is blocked by your country policy.',
    );
  for (const schedule of s.schedules.filter(
    (r) =>
      r.window.enabled &&
      targetMatches(r.target, device) &&
      r.domains.some((d) => matches(domain, d)),
  )) {
    const active = inWindow(schedule.window, at, schedule.timezone);
    if (schedule.mode === 'block-during' ? active : !active)
      return answer(
        'block',
        'schedule',
        `${schedule.name}: ${schedule.mode === 'block-during' ? 'restricted window is active' : 'outside the allowed window'}.`,
      );
  }
  if (profile) {
    const d = evaluate(
      explicitAllow
        ? { ...profile, allow: [...profile.allow, domain] }
        : profile,
      domain,
      scenario.category,
      at,
    );
    if (d.action === 'block')
      return { ...d, source: 'parental', profileId: profile.id };
    const approved =
      explicitAllow ||
      profile.allow.some((rule) => matches(domain, rule)) ||
      profile.grants.some(
        (g) =>
          at.getTime() >= g.startsAt &&
          at.getTime() < g.expiresAt &&
          matches(domain, g.domain),
      );
    if (
      !approved &&
      s.lists.parentalProfiles.includes(profile.id) &&
      ['adult', 'gambling'].includes(scenario.category)
    )
      return answer(
        'block',
        'parental-pack',
        'The test assumes a match in this profile’s adult/gambling content pack.',
      );
    if (scenario.feedMatch && !approved)
      return answer(
        'block',
        'blocklist',
        'The test assumes a curated feed match; no domain approval applies.',
      );
    return {
      ...d,
      source: explicitAllow ? 'domain' : 'parental',
      profileId: profile.id,
    };
  }
  if (scenario.feedMatch && !explicitAllow)
    return answer(
      'block',
      'blocklist',
      'The test assumes a curated feed match; no domain approval applies.',
    );
  return answer(
    'allow',
    explicitAllow ? 'domain' : 'default',
    explicitAllow
      ? 'A domain approval applies after higher-priority restrictions.'
      : 'No review policy blocks this request. This is not a safety verdict.',
  );
}

// Shared, deterministic policy logic. This module performs no DNS or network I/O.
export const categories = [
  { id: 'adult', name: 'Adult content' },
  { id: 'gambling', name: 'Gambling' },
  { id: 'dating', name: 'Dating' },
  { id: 'violence', name: 'Graphic violence' },
  { id: 'drugs', name: 'Drug-related sites' },
  { id: 'social', name: 'Social media' },
  { id: 'gaming', name: 'Gaming' },
  { id: 'streaming', name: 'Streaming video' },
  { id: 'shopping', name: 'Shopping' },
  { id: 'bypass', name: 'Known proxy / VPN sites' },
  { id: 'malware', name: 'Known malware / phishing' },
] as const;
export type Category = (typeof categories)[number]['id'];
export type Preset = 'child' | 'teen' | 'adult';
export type Window = {
  start: string;
  end: string;
  days: number[];
  enabled: boolean;
};
export type Grant = {
  id: string;
  domain: string;
  startsAt: number;
  expiresAt: number;
};
export type Profile = {
  id: string;
  name: string;
  preset: Preset;
  devices: string[];
  blockedCategories: Category[];
  approvedOnly: boolean;
  allow: string[];
  deny: string[];
  safeSearch: boolean;
  youtube: 'off' | 'moderate' | 'strict';
  timezone: string;
  bedtime: Window;
  homework: Window;
  pause: { startsAt: number; expiresAt: number } | null;
  grants: Grant[];
};
export type Draft = {
  version: 1;
  profiles: Profile[];
  retentionDays: 0 | 7 | 30;
  alerts: boolean;
};
export const devices = [
  { id: 'tablet', name: 'Family tablet', address: '192.0.2.22' },
  { id: 'tv', name: 'Living room TV', address: '192.0.2.21' },
  { id: 'printer', name: 'Workshop printer', address: '192.0.2.20' },
];
export const presetNames: Record<Preset, string> = {
  child: 'Child',
  teen: 'Teen',
  adult: 'Adult',
};
export const allDays = [0, 1, 2, 3, 4, 5, 6];
const categoryIds = categories.map((c) => c.id);
const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function createProfile(
  id: string,
  name: string,
  preset: Preset = 'child',
): Profile {
  const blocked: Record<Preset, Category[]> = {
    child: [
      'adult',
      'gambling',
      'dating',
      'violence',
      'drugs',
      'social',
      'bypass',
      'malware',
    ],
    teen: ['adult', 'gambling', 'bypass', 'malware'],
    adult: ['malware'],
  };
  return {
    id,
    name,
    preset,
    devices: [],
    blockedCategories: [...blocked[preset]],
    approvedOnly: false,
    allow: [],
    deny: [],
    safeSearch: preset !== 'adult',
    youtube:
      preset === 'child' ? 'strict' : preset === 'teen' ? 'moderate' : 'off',
    timezone: 'America/Phoenix',
    bedtime: {
      enabled: preset !== 'adult',
      start: preset === 'teen' ? '22:00' : '20:30',
      end: '07:00',
      days: [...allDays],
    },
    homework: {
      enabled: false,
      start: '16:00',
      end: '18:00',
      days: [1, 2, 3, 4, 5],
    },
    pause: null,
    grants: [],
  };
}
export function initialDraft(): Draft {
  const child = createProfile('child-example', 'Child · example');
  child.devices = ['tablet'];
  const shared = createProfile(
    'shared-example',
    'Shared devices · example',
    'teen',
  );
  shared.devices = ['tv'];
  return {
    version: 1,
    profiles: [child, shared],
    retentionDays: 7,
    alerts: true,
  };
}
export function applyPreset(profile: Profile, preset: Preset): Profile {
  const defaults = createProfile(profile.id, profile.name, preset);
  return {
    ...profile,
    preset,
    blockedCategories: defaults.blockedCategories,
    safeSearch: defaults.safeSearch,
    youtube: defaults.youtube,
  };
}
export function normalizeDomain(value: string): string {
  const input = value.trim().toLowerCase().replace(/\.$/, '');
  if (!input || input.length > 253 || /[\s/:@*?#\\]/.test(input))
    throw new Error(
      'Enter a domain only, such as school.example — no URL, path, IP address, or wildcard.',
    );
  const labels = input.split('.');
  if (
    labels.length < 2 ||
    labels.some(
      (label) => !/^([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/.test(label),
    ) ||
    /^\d+$/.test(labels.at(-1)!)
  )
    throw new Error(
      'Enter a valid domain. Use punycode for internationalized names.',
    );
  return input;
}
export function matches(domain: string, rule: string): boolean {
  return domain === rule || domain.endsWith('.' + rule);
}
function localClock(at: Date, timezone: string) {
  if (!Number.isFinite(at.getTime()))
    throw new Error('Choose a valid test date and time.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return {
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      part('weekday'),
    ),
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}
const minutes = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
export function inWindow(window: Window, at: Date, timezone: string): boolean {
  if (!window.enabled) return false;
  const { day, minute } = localClock(at, timezone),
    start = minutes(window.start),
    end = minutes(window.end);
  // The selected weekday is the START day of an overnight window. End is exclusive.
  if (start < end)
    return window.days.includes(day) && minute >= start && minute < end;
  return (
    (window.days.includes(day) && minute >= start) ||
    (window.days.includes((day + 6) % 7) && minute < end)
  );
}
export type Decision = {
  action: 'allow' | 'block' | 'restricted';
  reason: string;
  restrictions: string[];
};
export function evaluate(
  profile: Profile,
  input: string,
  category: Category | 'unknown',
  at: Date,
): Decision {
  const domain = normalizeDomain(input),
    now = at.getTime();
  localClock(at, profile.timezone);
  const blocked = (reason: string): Decision => ({
    action: 'block',
    reason,
    restrictions: [],
  });
  const permitted = (reason: string): Decision => {
    const restrictions: string[] = [];
    // Provider checks are illustrative, not a complete deployment mapping catalog.
    if (
      profile.safeSearch &&
      ['google.com', 'bing.com'].some((d) => matches(domain, d))
    )
      restrictions.push('SafeSearch');
    if (
      profile.youtube !== 'off' &&
      [
        'youtube.com',
        'youtube-nocookie.com',
        'googlevideo.com',
        'ytimg.com',
        'youtubei.googleapis.com',
        'youtube.googleapis.com',
      ].some((d) => matches(domain, d))
    )
      restrictions.push(`YouTube ${profile.youtube}`);
    return {
      action: restrictions.length ? 'restricted' : 'allow',
      reason,
      restrictions,
    };
  };
  if (category === 'malware' && profile.blockedCategories.includes('malware'))
    return blocked(
      'Known malware / phishing category takes priority over exceptions.',
    );
  if (
    profile.pause &&
    now >= profile.pause.startsAt &&
    now < profile.pause.expiresAt
  )
    return blocked('This profile’s new DNS lookups are paused.');
  if (
    profile.grants.some(
      (g) =>
        now >= g.startsAt && now < g.expiresAt && matches(domain, g.domain),
    )
  )
    return permitted('An unexpired parent-approved exception applies.');
  if (profile.deny.some((rule) => matches(domain, rule)))
    return blocked('A custom blocked-domain rule applies.');
  if (inWindow(profile.bedtime, at, profile.timezone))
    return blocked('Bedtime is active in this profile’s time zone.');
  if (
    inWindow(profile.homework, at, profile.timezone) &&
    ['social', 'gaming', 'streaming'].includes(category)
  )
    return blocked('Homework time blocks social media, gaming, and streaming.');
  if (profile.allow.some((rule) => matches(domain, rule)))
    return permitted('A custom approved-domain rule applies.');
  if (category !== 'unknown' && profile.blockedCategories.includes(category))
    return blocked(
      `The ${categories.find((c) => c.id === category)!.name.toLowerCase()} category is blocked.`,
    );
  if (profile.approvedOnly)
    return blocked('Approved-sites-only mode requires an approved domain.');
  return permitted(
    category === 'unknown'
      ? 'No rule matched. Unknown does not mean safe.'
      : 'No parental rule blocks this request.',
  );
}
export function assignDevice(
  draft: Draft,
  profileId: string,
  deviceId: string,
  assigned: boolean,
  deviceIds: string[] = devices.map((d) => d.id),
): Draft {
  if (
    !draft.profiles.some((p) => p.id === profileId) ||
    !deviceIds.includes(deviceId)
  )
    throw new Error('Unknown profile or example device.');
  return {
    ...draft,
    profiles: draft.profiles.map((p) => ({
      ...p,
      devices: [
        ...p.devices.filter(
          (d) => (!assigned && p.id !== profileId) || d !== deviceId,
        ),
        ...(assigned && p.id === profileId ? [deviceId] : []),
      ],
    })),
  };
}
export function validateDraft(
  input: unknown,
  deviceIds: string[] = devices.map((d) => d.id),
): Draft {
  const fail = (): never => {
    throw new Error(
      'Invalid parental-controls draft. Check names, domains, time zones, and schedules.',
    );
  };
  if (!input || typeof input !== 'object') return fail();
  const d = input as Draft;
  if (
    d.version !== 1 ||
    !Array.isArray(d.profiles) ||
    d.profiles.length < 1 ||
    d.profiles.length > 30 ||
    ![0, 7, 30].includes(d.retentionDays) ||
    typeof d.alerts !== 'boolean'
  )
    return fail();
  const ids = new Set<string>(),
    assigned = new Set<string>();
  for (const p of d.profiles) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !p.id ||
      p.id.length > 80 ||
      ids.has(p.id) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 60 ||
      !['child', 'teen', 'adult'].includes(p.preset)
    )
      return fail();
    ids.add(p.id);
    if (typeof p.timezone !== 'string' || p.timezone.length > 80) return fail();
    try {
      localClock(new Date(0), p.timezone);
    } catch {
      return fail();
    }
    if (
      !Array.isArray(p.devices) ||
      !Array.isArray(p.blockedCategories) ||
      p.blockedCategories.some((c) => !categoryIds.includes(c)) ||
      new Set(p.blockedCategories).size !== p.blockedCategories.length
    )
      return fail();
    for (const device of p.devices) {
      if (!deviceIds.includes(device) || assigned.has(device)) return fail();
      assigned.add(device);
    }
    if (
      typeof p.approvedOnly !== 'boolean' ||
      typeof p.safeSearch !== 'boolean' ||
      !['off', 'moderate', 'strict'].includes(p.youtube)
    )
      return fail();
    for (const list of [p.allow, p.deny]) {
      if (
        !Array.isArray(list) ||
        list.length > 500 ||
        new Set(list).size !== list.length
      )
        return fail();
      for (const rule of list) {
        if (typeof rule !== 'string') return fail();
        try {
          if (normalizeDomain(rule) !== rule) return fail();
        } catch {
          return fail();
        }
      }
    }
    for (const w of [p.bedtime, p.homework]) {
      if (
        !w ||
        typeof w.enabled !== 'boolean' ||
        typeof w.start !== 'string' ||
        typeof w.end !== 'string' ||
        !clockPattern.test(w.start) ||
        !clockPattern.test(w.end) ||
        w.start === w.end ||
        !Array.isArray(w.days) ||
        w.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
        new Set(w.days).size !== w.days.length ||
        (w.enabled && !w.days.length)
      )
        return fail();
    }
    const validTime = (v: number) =>
      Number.isFinite(v) && v >= 0 && v <= 8640000000000000;
    if (
      p.pause !== null &&
      (!p.pause ||
        !validTime(p.pause.startsAt) ||
        !validTime(p.pause.expiresAt) ||
        p.pause.expiresAt <= p.pause.startsAt ||
        p.pause.expiresAt - p.pause.startsAt > 86400000)
    )
      return fail();
    if (!Array.isArray(p.grants) || p.grants.length > 100) return fail();
    const grantIds = new Set<string>();
    for (const g of p.grants) {
      if (
        !g ||
        typeof g.id !== 'string' ||
        !g.id ||
        grantIds.has(g.id) ||
        typeof g.domain !== 'string' ||
        !validTime(g.startsAt) ||
        !validTime(g.expiresAt) ||
        g.expiresAt <= g.startsAt ||
        g.expiresAt - g.startsAt > 86400000
      )
        return fail();
      grantIds.add(g.id);
      try {
        if (normalizeDomain(g.domain) !== g.domain) return fail();
      } catch {
        return fail();
      }
    }
  }
  return structuredClone(d);
}

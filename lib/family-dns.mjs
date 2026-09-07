// Reviewed, deliberately compact DNS suffix packs. Not complete app/firewall signatures.
export const socialServices = [
  {
    id: 'roblox',
    name: 'Roblox',
    // AdGuard HostlistsRegistry service pack; suffixes include observed gamejoin,
    // assetdelivery, voice, presence and catalog requests without shared CDN bans.
    domains: ['blox.com', 'rbx.com', 'rbx.cn', 'rbxcdn.com', 'rbxcdn.net', 'rbxinfra.com', 'rbxinfra.net', 'roblox.cn', 'roblox.com', 'roblox.qq.com', 'robloxcdn.com', 'robloxdev.cn', 'rbxadder.com'],
    warning: 'Blocks new Roblox website, game-join, voice and asset DNS requests. Also affects Studio; existing game sessions may continue.',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    domains: [
      'facebook.com',
      'facebook.net',
      'fb.com',
      'fbcdn.net',
      'fb.watch',
      'fb.me',
    ],
    warning:
      'Facebook sign-in, embedded content and Messenger may also be affected.',
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    // Additional suffixes reviewed against AdGuard HostlistsRegistry Snapchat pack.
    domains: ['snapchat.com', 'snap.com', 'sc-cdn.net', 'snapkit.com', 'snapkit.co', 'snap-dev.net', 'snapads.com', 'impala-media-production.s3.amazonaws.com'],
    warning: 'Includes Snap integrations.',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    domains: ['instagram.com', 'cdninstagram.com', 'ig.me', 'igcdn.com'],
    warning: 'Meta services can share infrastructure.',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    domains: ['reddit.com', 'redd.it', 'redditmedia.com', 'redditstatic.com'],
    warning: '',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    domains: [
      'youtube.com',
      'youtu.be',
      'youtube-nocookie.com',
      'googlevideo.com',
      'ytimg.com',
      'youtubei.googleapis.com',
      'youtube.googleapis.com',
      'youtubekids.com',
    ],
    warning:
      'Also affects YouTube Kids, embedded videos and shared video delivery. Regional aliases are not exhaustive.',
  },
  {
    id: 'discord',
    name: 'Discord',
    domains: [
      'discord.com',
      'discord.gg',
      'discordapp.com',
      'discordapp.net',
      'discord.media',
    ],
    warning: 'Existing voice sessions may continue without new DNS lookups.',
  },
  {
    id: 'x',
    name: 'X / Twitter',
    domains: [
      'x.com',
      'twitter.com',
      't.co',
      'twimg.com',
      'pscp.tv',
      'periscope.tv',
    ],
    warning: '',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    domains: [
      'tiktok.com',
      'tiktokv.com',
      'tiktokv.us',
      'video.us.bytedance.map.fastly.net',
      'v45-ttp.gpm.ttoverseaus.net',
      'ttp-api16-tiktok-com-apix.bytewlb.akadns.net',
      'ttcdn-us.com',
      'p16-tiktok-dm-sticker-sign-sg.ibyteimg.com',
      'p16-oec-sg.ibyteimg.com',
      'p19-oec-va.ibyteimg.com',
      'tiktokcdn.com',
      'tiktokcdn-us.com',
      'tiktokcdn-eu.com',
      'musical.ly',
      'muscdn.com',
    ],
    warning:
      'Regional delivery domains can change; this is not a complete ByteDance block.',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    domains: ['twitch.tv', 'ttvnw.net', 'jtvnw.net', 'twitchcdn.net'],
    warning: '',
  },
];
export const familyDefaults = () => ({
  version: 1,
  paused: false,
  profiles: [],
  detailDays: 30,
});
const unique = (a) => [...new Set(a)];
const check = (condition, message) => {
  if (!condition) throw Object.assign(Error(message), { status: 400 });
};
export const safeDomain = (value) =>
  typeof value === 'string' &&
  value.length <= 253 &&
  value.includes('.') &&
  value
    .split('.')
    .every((p) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p));
export function validateFamily(value) {
  check(
    value &&
      value.version === 1 &&
      typeof value.paused === 'boolean' &&
      Number.isInteger(value.detailDays) &&
      value.detailDays >= 0 &&
      value.detailDays <= 30 &&
      Array.isArray(value.profiles) &&
      value.profiles.length <= 30,
    'Invalid family settings or retention (0–30 days).',
  );
  const profiles = value.profiles.map((p) => {
    check(
      p && Number.isSafeInteger(p.groupId) && p.groupId > 0,
      'Use a dedicated Pi-hole family group, not the Default group.',
    );
    check(
      typeof p.name === 'string' &&
        p.name.trim().length > 0 &&
        p.name.length <= 60 &&
        ![...p.name].some(c => c.charCodeAt(0) < 32),
      'Enter a profile name.',
    );
    check(
      typeof p.timezone === 'string' && p.timezone.length <= 80,
      'Choose a time zone.',
    );
    try {
      new Intl.DateTimeFormat('en', { timeZone: p.timezone }).format();
    } catch {
      check(false, 'Unknown time zone.');
    }
    check(
      Array.isArray(p.blocked) &&
        p.blocked.length <= socialServices.length &&
        p.blocked.every((id) => socialServices.some((s) => s.id === id)),
      'Unknown social platform.',
    );
    check(
      Array.isArray(p.schedules) && p.schedules.length <= 20,
      'Use at most 20 schedules per profile.',
    );
    const schedules = p.schedules.map((s) => {
      check(
        s &&
          typeof s.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,64}$/.test(s.id) &&
          typeof s.enabled === 'boolean' &&
          ['block-during', 'allow-during'].includes(s.mode),
        'Invalid schedule.',
      );
      check(
        Array.isArray(s.days) &&
          s.days.length > 0 &&
          s.days.length <= 7 &&
          s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        'Choose schedule days.',
      );
      check(
        [s.start, s.end].every(
          (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t),
        ) && s.start !== s.end,
        'Use distinct start and end times.',
      );
      check(
        Array.isArray(s.services) &&
          s.services.length <= socialServices.length &&
          s.services.every((id) => socialServices.some((p) => p.id === id)),
        'Unknown scheduled platform.',
      );
      check(
        Array.isArray(s.domains) &&
          s.domains.length <= 20 &&
          s.domains.every(safeDomain) &&
          s.domains.length + s.services.length > 0,
        'Choose platforms or enter lowercase website hostnames, without URLs.',
      );
      return {
        id: s.id,
        enabled: s.enabled,
        mode: s.mode,
        days: unique(s.days),
        start: s.start,
        end: s.end,
        services: unique(s.services),
        domains: unique(s.domains),
      };
    });
    check(
      unique(schedules.map((s) => s.id)).length === schedules.length,
      'Schedule IDs must be unique.',
    );
    return {
      groupId: p.groupId,
      name: p.name.trim(),
      timezone: p.timezone,
      blocked: unique(p.blocked),
      schedules,
    };
  });
  check(
    unique(profiles.map((p) => p.groupId)).length === profiles.length,
    'Each native group can have only one live family profile.',
  );
  return {
    version: 1,
    paused: value.paused,
    profiles,
    detailDays: value.detailDays,
  };
}
export function duringSchedule(s, timezone, at) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.weekday,
  );
  const now = Number(parts.hour) * 60 + Number(parts.minute);
  const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const start = minutes(s.start),
    end = minutes(s.end);
  return start < end
    ? s.days.includes(day) && now >= start && now < end
    : (s.days.includes(day) && now >= start) ||
        (s.days.includes((day + 6) % 7) && now < end);
}
export const familyPrefix = 'Super Pi Hole family v1: ';
export const suffixPattern = (domains) =>
  '(^|\\.)(' +
  [...domains]
    .sort((a, b) => a.localeCompare(b))
    .map((d) => d.replaceAll('.', '\\.'))
    .join('|') +
  ')$';
export function compileFamily(config, at) {
  const rules = new Map();
  const add = (domain, groupId) => {
    const rule = rules.get(domain) ?? {
      domain,
      type: 'deny',
      kind: 'regex',
      enabled: true,
      groups: [],
      comment: familyPrefix + 'managed DNS rule',
    };
    rule.groups = unique([...rule.groups, groupId]).sort((a, b) => a - b);
    rules.set(domain, rule);
  };
  for (const p of config.profiles) {
    if (config.paused) add('^.+$', p.groupId);
    const blocked = new Set(p.blocked);
    for (const s of p.schedules) {
      if (!s.enabled) continue;
      const during = duringSchedule(s, p.timezone, at);
      if (s.mode === 'block-during' ? during : !during) {
        s.services.forEach((id) => blocked.add(id));
        s.domains.forEach((d) => add(suffixPattern([d]), p.groupId));
      }
    }
    for (const id of blocked)
      add(
        suffixPattern(socialServices.find((s) => s.id === id).domains),
        p.groupId,
      );
  }
  return [...rules.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}
// Never turn a query string into arbitrary navigation, even if the engine is compromised.
export function inspectionUrl(domain) {
  return safeDomain(domain) ? `https://${domain}/` : null;
}

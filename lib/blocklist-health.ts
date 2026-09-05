// Preflight validation only: no fetching, automatic URL rewrite, or live Pi-hole writes.
export function inspectListUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { accepted: false, reason: 'Enter a complete HTTPS list URL.' };
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    return {
      accepted: false,
      reason: 'Use HTTPS without embedded credentials or a fragment.',
    };
  if (url.hostname === 'github.com') {
    const match = /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/.exec(
      url.pathname,
    );
    if (match)
      return {
        accepted: false,
        reason: 'This is a GitHub HTML page, not a raw list.',
        suggestedRawUrl: `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`,
      };
  }
  return {
    accepted: true,
    reason:
      'URL shape accepted; verify the downloaded content and network destination separately.',
  };
}

export function inspectListContent(
  text: string,
  contentType = '',
  previousRuleCount?: number,
) {
  const warnings: string[] = [],
    exact = new Set<string>(),
    suffix = new Set<string>();
  let invalidLines = 0,
    duplicates = 0;
  if (
    contentType.toLowerCase().includes('html') ||
    /<(?:!doctype\s+html|html|head|body)\b/i.test(text.slice(0, 4096))
  )
    return {
      accepted: false,
      reason: 'HTML response rejected. Keep the last known-good list.',
      ruleCount: 0,
      invalidLines: 0,
      duplicates: 0,
      warnings,
    };
  const validDomain = (d: string) =>
    d.length <= 253 &&
    d.includes('.') &&
    !/^\d+$/.test(d.split('.').at(-1)!) &&
    d
      .split('.')
      .every((label) =>
        /^([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/.test(label),
      );
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^\uFEFF/, '');
    // Hosts-file banner comments are harmless; inline cosmetic rules must not
    // become DNS blocks when the trailing comment is removed below.
    if (
      !line.startsWith('#') &&
      !line.startsWith('!') &&
      (line.includes('##') || /#[@?$%]#/.test(line))
    ) {
      invalidLines++;
      continue;
    }
    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith('!') ||
      /^\[Adblock(?:\s[^\]]*)?\]$/.test(line)
    )
      continue;
    const abp = /^\|\|([^\s^]+)\^$/.exec(line);
    let domains: string[], set: Set<string>;
    if (abp) {
      domains = [abp[1].toLowerCase()];
      set = suffix;
    } else {
      const parts = line.split('#')[0].trim().toLowerCase().split(/\s+/);
      domains = /^(0\.0\.0\.0|127\.0\.0\.1|::|::1)$/.test(parts[0])
        ? parts.slice(1)
        : parts;
      set = exact;
    }
    if (!domains.length || domains.some((d) => !validDomain(d))) {
      invalidLines++;
      continue;
    }
    for (const domain of domains) {
      if (set.has(domain)) duplicates++;
      set.add(domain);
    }
  }
  const ruleCount = exact.size + suffix.size;
  if (invalidLines)
    warnings.push(
      `${invalidLines} unsupported or malformed lines; do not silently convert browser-specific rules.`,
    );
  if (
    previousRuleCount !== undefined &&
    Number.isFinite(previousRuleCount) &&
    previousRuleCount > 0 &&
    ruleCount < previousRuleCount / 2
  )
    warnings.push(
      'Rule count fell by more than 50%; require review before replacement.',
    );
  const accepted = ruleCount > 0 && warnings.length === 0;
  return {
    accepted,
    reason: accepted
      ? 'Supported DNS list syntax. Reputation, freshness, and compatibility still need review.'
      : 'List needs review; do not automatically replace a working list.',
    ruleCount,
    invalidLines,
    duplicates,
    warnings,
  };
}

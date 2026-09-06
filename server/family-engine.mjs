import { familyPrefix } from '../lib/family-dns.mjs';
export const managedFamilyRules = (rows) =>
  rows
    .filter((r) => r.comment?.startsWith(familyPrefix))
    .map((r) => ({
      id: r.id,
      domain: r.domain,
      type: r.type,
      kind: r.kind,
      enabled: !!r.enabled,
      groups: [...r.groups].sort((a, b) => a - b),
      comment: r.comment,
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Runs inside the same mutation lock as all manual engine edits. Read before writing;
// uncertain multi-rule changes are stopped by the persistent controller, never replayed.
export async function syncFamilyEngine(
  { request, fail },
  { desired, expected, groupIds },
) {
  const groups = (await request('groups')).groups;
  if (
    !Array.isArray(groups) ||
    groupIds.some((id) => !groups.some((g) => g.id === id && g.enabled))
  )
    throw fail(
      409,
      'A family group is missing or disabled. Fix its assignment before applying.',
    );
  const all = (await request('domains')).domains;
  if (!Array.isArray(all))
    throw fail(502, 'Pi-hole domain inventory is unavailable.');
  const owned = managedFamilyRules(all);
  if (!same(owned, expected))
    throw fail(
      409,
      'Managed family rules changed outside this controller, or a previous change was interrupted. Review the engine rules before explicitly retrying.',
    );
  // No taking over a user-created matching regex. Disabling a control must never disable a user rule.
  for (const rule of desired)
    if (
      all.some(
        (r) =>
          r.domain === rule.domain &&
          r.type === 'deny' &&
          r.kind === 'regex' &&
          !r.comment?.startsWith(familyPrefix),
      )
    )
      throw fail(
        409,
        'A matching block rule already exists outside family controls. Keep it or edit it in Domain rules; it will not be overwritten.',
      );
  for (const r of owned)
    if (r.type !== 'deny' || r.kind !== 'regex')
      throw fail(
        409,
        'A managed rule was converted to an allow rule. Resolve that conflict in Domain rules first.',
      );
  let changes = 0;
  for (const r of desired) {
    const current = owned.find((x) => x.domain === r.domain);
    if (current && same({ ...current, id: undefined }, { ...r, id: undefined }))
      continue;
    const path =
      'domains/deny/regex' +
      (current ? '/' + encodeURIComponent(r.domain) : '');
    const { id: _id, ...payload } = r;
    await request(path, current ? 'PUT' : 'POST', payload);
    changes++;
  }
  // Only delete our no-longer-needed rules; original subscriptions and allowlists stay intact.
  for (const r of owned)
    if (!desired.some((x) => x.domain === r.domain)) {
      await request(
        'domains/deny/regex/' + encodeURIComponent(r.domain),
        'DELETE',
      );
      changes++;
    }
  const result = managedFamilyRules((await request('domains')).domains ?? []);
  if (
    result.length !== desired.length ||
    desired.some(
      (d) =>
        !result.some(
          (r) =>
            r.domain === d.domain &&
            r.type === d.type &&
            r.kind === d.kind &&
            r.enabled === d.enabled &&
            same(r.groups, d.groups) &&
            r.comment === d.comment,
        ),
    )
  )
    throw fail(
      502,
      'Family rules were submitted but Pi-hole readback differs. Automatic changes are stopped; inspect before retrying.',
    );
  const blocking = await request('dns/blocking');
  return {
    rules: result,
    changes,
    blocking: blocking.blocking,
    warning:
      'DNS-only: Pi-hole allowlists take precedence. Cached connections, VPNs, encrypted DNS and direct IPs can bypass these blocks.',
  };
}

'use client';

import { useMemo, useState } from 'react';
import { Monitor, PlayCircle, RefreshCw, ShieldCheck, Tv, UsersRound } from 'lucide-react';
import catalog from '@/config/blocklist-presets.json';
import { socialServices, suffixPattern } from '@/lib/family-dns.mjs';
import { liveApi, useData } from './live-pihole';
import { Button } from './ui/button';
import { Switch } from './ui/switch';

type Group = { id: number; name: string; enabled: boolean };
type List = { id: number; address: string; type: string; enabled: boolean; groups: number[]; comment: string | null };
type Rule = { id: number; domain: string; type: string; kind: string; enabled: boolean; groups: number[]; comment: string | null };
type Status = { configured: boolean; writeEnabled: boolean };
type FamilyState = { config: { profiles: { groupId: number; name: string }[] } };
const prefix = 'Super Pi Hole network v1: ';
const baselineIds = ['balanced', 'privacy', 'aggressive', 'maximum', 'compatibility'];

const sameGroups = (a: number[], b: number[]) =>
  JSON.stringify([...new Set(a)].sort((x, y) => x - y)) ===
  JSON.stringify([...new Set(b)].sort((x, y) => x - y));

export function NetworkPolicyControls({ view }: { view: 'blocklists' | 'social' }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const status = useData<Status>('status', revision);
  const groupsData = useData<{ groups: Group[] }>('groups', revision);
  const listsData = useData<{ lists: List[] }>('lists', revision);
  const rulesData = useData<{ domains: Rule[] }>('domains', revision);
  const familyData = useData<FamilyState>('family/state', revision);
  const groups = (groupsData.data?.groups ?? []).filter((g) => g.enabled);
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const lists = listsData.data?.lists ?? [];
  const rules = rulesData.data?.domains ?? [];
  const locked = busy || !status.data?.writeEnabled || !groups.length;
  const refresh = () => setRevision((n) => n + 1);
  const source = (id: string) => catalog.sources.find((s) => s.id === id)!;
  const listFor = (id: string) => lists.find((l) => l.type === 'block' && l.address === source(id).url);
  const covered = (entry?: List | Rule) => !!entry?.enabled && sameGroups(entry.groups, groupIds);
  const ask = (text: string) => window.confirm(`${text}\n\nThis changes live Pi-hole filtering for: ${groups.map((g) => g.name).join(', ')}.`);
  const act = async (body: Record<string, unknown>) => liveApi<{ message: string }>('action', undefined, { ...body, confirmed: true });

  const saveList = async (sourceId: string) => {
    const s = source(sourceId), existing = listFor(sourceId);
    await act({ action: 'list-save', create: !existing, expected: existing, address: s.url, type: 'block', enabled: true, groups: groupIds, comment: `${prefix}${sourceId}` });
  };
  const saveListGroups = async (sourceId: string, targetGroups: number[], owner: string) => {
    const s = source(sourceId), existing = listFor(sourceId);
    if (existing && !existing.comment?.startsWith(prefix)) throw Error(`${s.name} already exists but is not owned by Super Pi Hole. Manage that subscription in Lists.`);
    await act({ action: 'list-save', create: !existing, expected: existing, address: s.url, type: 'block', enabled: true, groups: targetGroups, comment: `${prefix}${owner}:${sourceId}` });
  };
  const removeList = async (sourceId: string) => {
    const existing = listFor(sourceId);
    if (!existing) return;
    if (!existing.comment?.startsWith(prefix)) throw Error(`${source(sourceId).name} already exists but is not owned by Super Pi Hole. Manage that subscription in Lists.`);
    await act({ action: 'list-delete', create: false, expected: existing, address: existing.address, type: 'block' });
  };
  const run = async (label: string, operation: () => Promise<void>, gravity = false) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await operation();
      if (gravity) await act({ action: 'gravity-update' });
      setMessage(gravity ? `${label} saved. Pi-hole Gravity is rebuilding in the background; check Advanced Pi-hole for completion.` : `${label} saved and verified in Pi-hole.`);
      refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const presetState = (id: string) => {
    const preset = catalog.presets.find((p) => p.id === id)!;
    return preset.sources.every((sid) => covered(listFor(sid)));
  };
  const setPreset = async (id: string, enabled: boolean) => {
    const p = catalog.presets.find((item) => item.id === id)!;
    if (!ask(enabled ? `Enable ${p.name} as the network-wide baseline? Other Super Pi Hole baselines will be replaced.` : `Disable the ${p.name} network-wide baseline?`)) return;
    await run(p.name, async () => {
      const desired = enabled ? new Set(p.sources) : new Set<string>();
      const allBaselineSources = new Set(catalog.presets.filter((x) => baselineIds.includes(x.id)).flatMap((x) => x.sources));
      for (const sid of allBaselineSources) {
        if (desired.has(sid)) await saveList(sid); else await removeList(sid);
      }
    }, true);
  };
  const setPrivacy = async (id: string, enabled: boolean) => {
    const p = catalog.presets.find((item) => item.id === id)!;
    if (!ask(`${enabled ? 'Enable' : 'Disable'} ${p.name} across the whole network? Compatibility with updates, streaming and sign-in should be checked afterward.`)) return;
    await run(p.name, () => enabled ? saveList(p.sources[0]) : removeList(p.sources[0]), true);
  };
  const parentalPreset = catalog.presets.find((item) => item.id === 'parental-content')!;
  const parentalProfiles = familyData.data?.config.profiles ?? [];
  const parentalState = (groupId: number) => parentalPreset.sources.every((sourceId) => {
    const entry = listFor(sourceId);
    return !!entry?.enabled && entry.groups.includes(groupId);
  });
  const setParentalContent = async (profile: { groupId: number; name: string }, enabled: boolean) => {
    if (!window.confirm(`${enabled ? 'Enable' : 'Disable'} adult-content and gambling protection for ${profile.name}?\n\nThis changes real Pi-hole subscriptions for group ${profile.groupId} and rebuilds Gravity.`)) return;
    await run(`${profile.name} parental content`, async () => {
      for (const sourceId of parentalPreset.sources) {
        const existing = listFor(sourceId);
        if (existing && !existing.comment?.startsWith(prefix)) throw Error(`${source(sourceId).name} already exists but is not owned by Super Pi Hole. It was left unchanged.`);
        const nextGroups = enabled
          ? [...new Set([...(existing?.groups ?? []), profile.groupId])]
          : (existing?.groups ?? []).filter((id) => id !== profile.groupId);
        if (nextGroups.length) await saveListGroups(sourceId, nextGroups, 'parental');
        else if (existing) await removeList(sourceId);
      }
    }, true);
  };
  const socialRule = (id: string) => {
    const service = socialServices.find((s) => s.id === id)!;
    const pattern = suffixPattern(service.domains);
    return rules.find((r) => r.type === 'deny' && r.kind === 'regex' && r.domain === pattern);
  };
  const setSocial = async (id: string, enabled: boolean) => {
    const service = socialServices.find((s) => s.id === id)!;
    const pattern = suffixPattern(service.domains), existing = socialRule(id);
    if (!ask(`${enabled ? 'Block' : 'Allow'} ${service.name} across the whole network? DNS filtering can be bypassed by VPNs, encrypted DNS, cached answers or direct IP connections.`)) return;
    await run(service.name, async () => {
      if (enabled) {
        if (existing && !existing.comment?.startsWith(prefix)) throw Error(`A matching ${service.name} rule already exists but is not owned by Super Pi Hole. Review it under Domain rules.`);
        await act(existing ? { action: 'domain-edit', domain: pattern, type: 'deny', nextType: 'deny', kind: 'regex', enabled: true, groups: groupIds, comment: `${prefix}social:${id}`, expected: existing } : { action: 'domain-add', domain: pattern, type: 'deny', kind: 'regex', groups: groupIds, comment: `${prefix}social:${id}` });
      } else if (existing) {
        if (!existing.comment?.startsWith(prefix)) throw Error(`The matching ${service.name} rule is not owned by Super Pi Hole and was left unchanged.`);
        await act({ action: 'domain-delete', domain: pattern, type: 'deny', kind: 'regex' });
      }
    });
  };

  const loadError = status.error || groupsData.error || listsData.error || rulesData.error || familyData.error;
  return <div className="sph-network-policy">
    <div className="section-head nc-heading">
      <div>
        <p className="eyebrow">LIVE DNS / NETWORK-WIDE</p>
        <h1>{view === 'blocklists' ? 'Ad & tracker protection' : 'Social platforms'}</h1>
        <p>{view === 'blocklists' ? '2026-ready DNS protection backed by curated Pi-hole subscriptions. Every enabled Pi-hole group is covered.' : 'Block or allow individual services for the entire network. Family-specific choices remain in Parental Controls.'}</p>
      </div>
      <Button variant="outline" disabled={busy} onClick={refresh}><RefreshCw /> Refresh</Button>
    </div>
    <div className="nc-review-strip"><ShieldCheck /><span>Live scope: {groups.length ? groups.map((g) => g.name).join(', ') : 'loading groups…'}. Existing user-created lists and rules are never removed.</span></div>
    {loadError && <p className="pc-error" role="alert">{loadError}</p>}
    {error && <p className="pc-error" role="alert">{error}</p>}
    <output className="pc-feedback" aria-live="polite">{message}</output>
    {view === 'blocklists' ? <>
      <section className="panel">
        <div className="section-head"><div><h2>Network protection baseline</h2><p>Choose one level. Balanced keeps social media and YouTube available; stronger levels trade compatibility for more blocking.</p></div><UsersRound /></div>
        <div className="nc-preset-grid">
          {catalog.presets.filter((p) => baselineIds.includes(p.id)).map((p) => {
            const on = presetState(p.id);
            return <article className={`sph-policy-card ${on ? 'selected' : ''}`} key={p.id}>
              <span className="badge">{p.id === 'balanced' ? 'Recommended' : p.id === 'privacy' ? 'Stronger' : p.id === 'aggressive' ? 'Aggressive' : p.id === 'maximum' ? 'Expert' : 'Compatibility'}</span>
              <h3>{p.name}</h3><p>{p.note}</p>
              <small>{p.sources.map((sid) => source(sid).name).join(' + ')}</small>
              <label className="sph-toggle-row"><span>{on ? 'Active on every group' : 'Off'}</span><Switch disabled={locked} checked={on} onCheckedChange={(v) => void setPreset(p.id, v)} /></label>
            </article>;
          })}
        </div>
      </section>
      <section className="panel sph-capability-card">
        <div className="section-head"><div><h2>YouTube and in-app advertising</h2><p>Clear expectations prevent a protection switch from silently breaking video playback.</p></div><PlayCircle /></div>
        <div className="nc-two">
          <div><h3>What Super Pi Hole blocks well</h3><p>Ads, trackers, malware, phishing and telemetry served from dedicated hostnames across browsers, phones, tablets, PCs, consoles and smart devices that use this DNS server.</p></div>
          <div><h3>What DNS alone cannot reliably remove</h3><p>YouTube in-stream ads and some ads embedded by streaming or social apps share delivery infrastructure with wanted content. Blocking those hostnames can also block the video. Super Pi Hole will not intercept encrypted traffic or pretend this limitation is solved.</p></div>
        </div>
        <p className="nc-helper">The Social Platforms page blocks an entire service when requested; it is not an in-app ad filter. Browser content blockers remain the most effective companion for page-level and YouTube ad removal on supported browsers.</p>
      </section>
      <section className="panel">
        <div className="section-head"><div><h2>Parental content protection</h2><p>Real HaGeZi adult-content and gambling subscriptions scoped to each registered family group.</p></div><UsersRound /></div>
        {parentalProfiles.length ? <div className="sph-social-grid">{parentalProfiles.map((profile) => {
          const on = parentalState(profile.groupId);
          return <article className={`sph-policy-card ${on ? 'selected' : ''}`} key={profile.groupId}><h3>{profile.name}</h3><p>Pi-hole group {profile.groupId}. Devices assigned to this group receive the selected protection after Gravity completes.</p><small>{parentalPreset.sources.map((id) => source(id).name).join(' + ')}</small><label className="sph-toggle-row"><span>{on ? 'Filtering active' : 'Off'}</span><Switch disabled={locked} checked={on} onCheckedChange={(value) => void setParentalContent(profile, value)} /></label></article>;
        })}</div> : <p>No real family groups are registered yet. Create a family member under Parental Controls, then return here to enable its content pack.</p>}
      </section>
      <section className="panel">
        <h2>Device privacy packs</h2><p>Optional stricter protection. These switches intentionally apply network-wide; use Pi-hole groups directly when you need device-only scope.</p>
        <div className="nc-two">
          {catalog.presets.filter((p) => ['windows-telemetry', 'lg-telemetry'].includes(p.id)).map((p) => {
            const entry = listFor(p.sources[0]), on = covered(entry), Icon = p.id === 'windows-telemetry' ? Monitor : Tv;
            return <article className={`sph-policy-card ${on ? 'selected' : ''}`} key={p.id}><Icon /><h3>{p.name}</h3><p>{p.note}</p><label className="sph-toggle-row"><span>{on ? 'Active network-wide' : entry ? 'Coverage needs repair' : 'Off'}</span><Switch disabled={locked} checked={on} onCheckedChange={(v) => void setPrivacy(p.id, v)} /></label></article>;
          })}
        </div>
      </section>
    </> : <section className="panel"><div className="sph-social-grid">
      {socialServices.map((service) => { const entry = socialRule(service.id), on = covered(entry); return <article className={`sph-policy-card ${on ? 'selected danger' : ''}`} key={service.id}><h3>{service.name}</h3><p>{service.warning || 'Blocks the primary service domains.'}</p><small>{service.domains.length} known DNS suffixes</small><label className="sph-toggle-row"><span>{on ? 'Blocked network-wide' : entry ? 'Coverage needs repair' : 'Allowed'}</span><Switch disabled={locked} checked={on} onCheckedChange={(v) => void setSocial(service.id, v)} /></label></article>; })}
    </div></section>}
    <p className="nc-helper">Every switch on this page writes to Pi-hole and verifies the saved configuration. List switches rebuild Gravity automatically. Social switches are direct Pi-hole regex rules and take effect immediately. DNS controls hostnames, not full URLs, app processes, inbound connections, or traffic volume.</p>
  </div>;
}

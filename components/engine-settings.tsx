'use client';
import { useState } from 'react';
import { Button } from './ui/button';
import { liveApi, useData } from './live-pihole';
import { GravityControl } from './gravity-control';

type Entry = { id: number; name?: string; address?: string; type?: string; enabled: boolean; comment: string | null; groups?: number[] };
export function EngineSettings() {
  const [revision, refresh] = useState(0), [section, setSection] = useState('dns'), [draft, setDraft] = useState(''), [expected, setExpected] = useState<unknown>(null);
  const [kind, setKind] = useState<'groups' | 'lists'>('groups'), [entry, setEntry] = useState<Entry | null>(null), [name, setName] = useState(''), [enabled, setEnabled] = useState(true), [comment, setComment] = useState(''), [groupIds, setGroupIds] = useState('0'), [listType, setListType] = useState('block');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const config = useData<{ config: Record<string, unknown> }>('engine-config', revision), inventory = useData<Record<string, Entry[]>>(kind, revision), status = useData<{ writeEnabled: boolean; adminUrl: string | null }>('status', 0);
  const write = async (body: Record<string, unknown>, warning: string) => {
    if (!window.confirm(warning)) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await liveApi<{ message: string }>('action', undefined, { ...body, confirmed: true }); setMessage(result.message); setDraft(''); setExpected(null); setEntry(null); setName(''); refresh(r => r + 1); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <>
    <div className="section-head"><div><p className="eyebrow">LIVE ENGINE CONTROL</p><h1>Advanced Pi-hole</h1><p>Change the bundled engine from Super Pi Hole. No simulation settings are applied here.</p></div>{status.data?.adminUrl && <a href={status.data.adminUrl} target="_blank" rel="noreferrer">Open original interface ↗</a>}</div>
    <p className="nc-review-strip">The integrated stock interface is read-only. Listener, authentication and filesystem boundaries are controlled by the deployment. NAS administrators can still change host/container configuration.</p>
    {(error || config.error || inventory.error) && <p role="alert" className="pc-error">{error || config.error || inventory.error}</p>}
    <output className="pc-feedback" aria-live="polite">{message}</output>
    <section className="panel"><h2>DNS engine settings</h2><p>Advanced JSON editor for existing Pi-hole settings. Changes to DNS, DHCP or upstream resolvers can interrupt connectivity. Only changed fields are submitted; unrelated settings are retained.</p>
      <label>Settings section<select value={section} onChange={e => { setSection(e.target.value); setDraft(''); setExpected(null); }}>{['dns', 'dhcp', 'ntp', 'resolver', 'database'].map(s => <option key={s}>{s}</option>)}</select></label>
      <Button variant="outline" disabled={!config.data || busy} onClick={() => { const current = config.data?.config[section]; setExpected(current); setDraft(JSON.stringify(current, null, 2)); }}>Load current section</Button>
      {draft && <><label>Current section JSON<textarea value={draft} onChange={e => setDraft(e.target.value)} rows={20} style={{ width: '100%', fontFamily: 'monospace' }} /></label><Button disabled={busy || !status.data?.writeEnabled} onClick={() => { try { const value = JSON.parse(draft); if (!value || Array.isArray(value) || typeof value !== 'object') throw Error('Enter a JSON object.'); void write({ action: 'config-set', config: { [section]: value }, expected: { [section]: expected } }, `Apply changed ${section} settings to live Pi-hole? This may restart DNS and interrupt connections.`); } catch (e) { setError((e as Error).message); } }}>Review and apply engine settings</Button></>}
    </section>
    <section className="panel"><h2>Groups and subscriptions</h2><p>Use real filtering groups for family members and IoT devices. Disabling a group disables its filtering rules; it does not pause Internet access.</p>
      <label>Manage<select value={kind} onChange={e => { setKind(e.target.value as 'groups' | 'lists'); setEntry(null); setName(''); }}>{['groups', 'lists'].map(s => <option key={s}>{s}</option>)}</select></label>
      <div style={{ maxHeight: 260, overflow: 'auto' }}>{inventory.data?.[kind]?.map(item => <div key={item.id}><Button variant="ghost" onClick={() => { setEntry(item); setName(item.name ?? item.address ?? ''); setEnabled(item.enabled); setComment(item.comment ?? ''); setGroupIds((item.groups ?? [0]).join(',')); setListType(item.type ?? 'block'); }}>{item.name ?? item.address} · {item.enabled ? 'enabled' : 'disabled'}</Button></div>)}</div>
      <Button variant="outline" onClick={() => { setEntry(null); setName(''); setEnabled(true); setComment(''); setGroupIds('0'); }}>New {kind === 'groups' ? 'group' : 'subscription'}</Button>
      <label>{kind === 'groups' ? 'Group name' : 'HTTPS list URL'}<input value={name} onChange={e => setName(e.target.value)} disabled={kind === 'lists' && !!entry} /></label>
      <label>Comment<input value={comment} onChange={e => setComment(e.target.value)} /></label>
      <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
      {kind === 'lists' && <><label>Group IDs<input value={groupIds} onChange={e => setGroupIds(e.target.value)} placeholder="0,1" /></label><label>List type<select value={listType} disabled={!!entry} onChange={e => setListType(e.target.value)}><option value="block">Block list</option><option value="allow">Allow list</option></select></label><p>Refresh Gravity after subscription changes. List data updates do not update application code.</p></>}
      <div className="sph-actions"><Button disabled={!name.trim() || busy || !status.data?.writeEnabled} onClick={() => void write({ action: kind === 'groups' ? 'group-save' : 'list-save', create: !entry, expected: entry, name, previous: entry?.name, address: name, type: listType, enabled, groups: groupIds.split(',').map(x => Number(x.trim())), comment: comment || null }, `${entry ? 'Update' : 'Create'} ${name} in live Pi-hole?`)}>Save live {kind === 'groups' ? 'group' : 'subscription'}</Button>
      {entry && <Button variant="outline" disabled={busy || !status.data?.writeEnabled || (kind === 'groups' && entry.id === 0)} onClick={() => void write({ action: kind === 'groups' ? 'group-delete' : 'list-delete', expected: entry, name: entry.name, previous: entry.name, address: entry.address, type: entry.type }, `Delete ${entry.name ?? entry.address}? This changes filtering for associated devices.`)}>Delete selected</Button>}</div>
    </section>
    <GravityControl />
  </>;
}

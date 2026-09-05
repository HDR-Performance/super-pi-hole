'use client';
import { useEffect, useState } from 'react';
import { Monitor, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { liveApi, useData, QueryLog } from './live-pihole';
type Client = { client: string; groups: number[]; comment: string | null };
type Device = { id: number; hwaddr: string; macVendor: string | null; lastQuery: number; numQueries: number; ips: { ip: string; name: string | null; lastSeen: number }[] };
type Inventory = { devices: Device[]; groups: { id: number; name: string; enabled: boolean }[]; clients: Client[]; fetchedAt: string; coverage: string };
export function LiveDevices() {
  const [revision, refresh] = useState(0), [search, setSearch] = useState(''), [selected, select] = useState(''), [history, showHistory] = useState(false);
  const [groups, setGroups] = useState<number[]>([]), [expected, setExpected] = useState<Client | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const inventory = useData<Inventory>('devices', revision), status = useData<{ writeEnabled: boolean }>('status', 0);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden && !busy) refresh(r => r + 1); }, 5000); return () => clearInterval(timer); }, [busy]);
  const choose = (ip: string) => {
    const client = inventory.data?.clients.find(c => c.client === ip) ?? null;
    select(ip); setExpected(client); setGroups(client?.groups ?? [0]); showHistory(false); setMessage(''); setError('');
  };
  const rows = inventory.data?.devices.filter(d => [d.hwaddr, d.macVendor, ...d.ips.flatMap(a => [a.ip, a.name])].join(' ').toLowerCase().includes(search.toLowerCase())) ?? [];
  const device = inventory.data?.devices.find(d => d.hwaddr === selected || d.ips.some(a => a.ip === selected));
  return <div className="sph-devices">
    <div className="section-head"><div><p className="eyebrow">LIVE DEVICE CENTER</p><h1>Devices on your network</h1><p>Observed by your DNS engine · refreshed every 5 seconds while visible.</p></div><Button variant="outline" onClick={() => refresh(r => r + 1)}><RefreshCw />Refresh</Button></div>
    <p className="nc-review-strip">{inventory.data?.coverage ?? 'Waiting for the connected DNS engine. No example devices are used in this view.'} A last-seen time is not proof that a device is online now.</p>
    {(inventory.error || error) && <p role="alert" className="pc-error">{inventory.error || error}</p>}
    <section className="panel">
      <label>Find a device<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, IP, MAC or manufacturer" /></label>
      <div style={{ maxHeight: 420, overflow: 'auto' }}><table className="data-table"><thead><tr><th>Device</th><th>Addresses</th><th>Last DNS request</th><th>Queries</th><th>Activity / data</th></tr></thead><tbody>
        {rows.map(d => <tr key={d.id}><td><Button variant="ghost" onClick={() => choose(d.ips[0]?.ip ?? d.hwaddr)}><Monitor />{d.ips.find(a => a.name)?.name ?? d.macVendor ?? d.hwaddr}</Button><small>{d.hwaddr}</small></td><td>{d.ips.map(a => a.ip).join(', ')}</td><td>{d.lastQuery ? new Date(d.lastQuery * 1000).toLocaleString() : 'Not observed'}</td><td>{d.numQueries.toLocaleString()}</td><td>{inventory.data && d.lastQuery * 1000 >= new Date(inventory.data.fetchedAt).getTime() - 300000 ? 'DNS active in last 5 minutes' : 'No recent DNS observed'}<small className="sph-sub">Bytes: unavailable · needs gateway telemetry</small></td></tr>)}
      </tbody></table>{!rows.length && <p>No matching observed devices. Devices must be visible to this Pi-hole; this is not a full LAN scan.</p>}</div>
      {inventory.data && <small>Last inventory response: {new Date(inventory.data.fetchedAt).toLocaleTimeString()}</small>}
    </section>
    <section className="panel"><h2>Select or define a device</h2><p>Choose a discovered address, or enter an IPv4, IPv6 or MAC address manually. An IP assignment takes precedence over a MAC assignment in Pi-hole. Use DHCP reservations for stable history and filtering.</p>
      <label>Discovered device<select size={6} value={selected} onChange={e => choose(e.target.value)} style={{ width: '100%', maxHeight: 190 }}>{inventory.data?.devices.flatMap(d => d.ips.map(a => <option key={`${d.id}-${a.ip}`} value={a.ip}>{a.name ?? d.macVendor ?? 'Unnamed device'} — {a.ip} — {d.hwaddr}</option>))}</select></label>
      <label>Manual IP or MAC<input value={selected} onChange={e => choose(e.target.value)} placeholder="192.0.2.20" /></label>
      {selected && <><h3>{device?.ips.find(a => a.name)?.name ?? selected}</h3><Button onClick={() => showHistory(v => !v)} disabled={selected.includes(':') && !selected.includes('::') && selected.split(':').every(x => x.length === 2)}>History</Button>
        <fieldset><legend>Live filtering groups / family groups</legend>{inventory.data?.groups.map(g => <label key={g.id} style={{ display: 'block', padding: 6 }}><input type="checkbox" checked={groups.includes(g.id)} onChange={e => setGroups(e.target.checked ? [...groups, g.id] : groups.filter(id => id !== g.id))} /> {g.name}{!g.enabled && ' (disabled group)'}</label>)}</fieldset>
        <p>These are real Pi-hole groups. Register a dedicated group under Parental Controls to attach live social blocks and schedules. The separately labeled policy simulator remains non-enforcing.</p>
        <Button disabled={busy || !status.data?.writeEnabled || !groups.length} onClick={async () => {
          if (!window.confirm(`Apply groups ${groups.join(', ')} to ${selected}? This changes live DNS filtering.`)) return;
          setBusy(true); setError(''); setMessage('');
          try { const result = await liveApi<{ message: string; verified: { clients: Client[] } }>('action', undefined, { action: 'client-assign', client: selected, groups, expected, confirmed: true }); setExpected(result.verified.clients.find(c => c.client === selected) ?? null); setMessage(result.message); refresh(r => r + 1); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? 'Applying…' : 'Apply live group assignment'}</Button>
        <output className="pc-feedback" aria-live="polite">{message}</output>
      </>}
    </section>
    {history && selected && <QueryLog key={selected} revision={revision} initial={{ client_ip: selected }} prepareRule={async (domain, type) => {
      if (!window.confirm(`${type === 'deny' ? 'Block' : 'Allow'} ${domain} for the selected groups ${groups.join(', ')}? Other devices in these groups are also affected.`)) return;
      try { const result = await liveApi<{ message: string }>('action', undefined, { action: 'domain-add', domain, type, kind: 'exact', groups, enabled: true, comment: 'Super Pi Hole device history', confirmed: true }); setMessage(result.message); refresh(r => r + 1); } catch (e) { setError((e as Error).message); }
    }} />}
  </div>;
}

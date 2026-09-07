'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Monitor, RefreshCw, UsersRound } from 'lucide-react';
import { Button } from './ui/button';
import { liveApi, useData, QueryLog } from './live-pihole';

type Client = { client: string; groups: number[]; comment: string | null };
type Group = { id: number; name: string; enabled: boolean };
type Device = { id: number; hwaddr: string; macVendor: string | null; lastQuery: number; numQueries: number; ips: { ip: string; name: string | null; lastSeen: number }[] };
type Inventory = { devices: Device[]; groups: Group[]; clients: Client[]; fetchedAt: string; coverage: string };
type DeviceRow = { key: string; address: string; name: string; hwaddr: string; addresses: string[]; lastQuery: number; numQueries: number; client: Client | null; configuredOnly: boolean };

export function LiveDevices() {
  const [revision, refresh] = useState(0), [search, setSearch] = useState(''), [selected, select] = useState(''), [history, showHistory] = useState(false);
  const [groups, setGroups] = useState<number[]>([]), [expected, setExpected] = useState<Client | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const inventory = useData<Inventory>('devices', revision), status = useData<{ writeEnabled: boolean }>('status', revision);

  useEffect(() => { const timer = setInterval(() => { if (!document.hidden && !busy) refresh((r) => r + 1); }, 5000); return () => clearInterval(timer); }, [busy]);

  const deviceRows = useMemo<DeviceRow[]>(() => {
    if (!inventory.data) return [];
    const usedClients = new Set<string>();
    const observed = inventory.data.devices.map((device) => {
      const client = inventory.data!.clients.find((candidate) => candidate.client.toLowerCase() === device.hwaddr.toLowerCase() || device.ips.some((address) => candidate.client === address.ip)) ?? null;
      if (client) usedClients.add(client.client);
      return { key: `device-${device.id}`, address: client?.client ?? device.ips[0]?.ip ?? device.hwaddr, name: device.ips.find((address) => address.name)?.name ?? device.macVendor ?? device.hwaddr, hwaddr: device.hwaddr, addresses: device.ips.map((address) => address.ip), lastQuery: device.lastQuery, numQueries: device.numQueries, client, configuredOnly: false };
    });
    const configured = inventory.data.clients.filter((client) => !usedClients.has(client.client)).map((client) => ({ key: `client-${client.client}`, address: client.client, name: client.comment || 'Configured client', hwaddr: client.client.includes(':') ? client.client : '', addresses: [client.client], lastQuery: 0, numQueries: 0, client, configuredOnly: true }));
    return [...observed, ...configured].sort((a, b) => b.lastQuery - a.lastQuery || a.name.localeCompare(b.name));
  }, [inventory.data]);

  const rows = deviceRows.filter((device) => [device.name, device.hwaddr, ...device.addresses].join(' ').toLowerCase().includes(search.toLowerCase()));
  const selectedRow = deviceRows.find((device) => device.address === selected || device.addresses.includes(selected));
  const enabledGroups = inventory.data?.groups.filter((group) => group.enabled) ?? [];
  const groupName = (id: number) => inventory.data?.groups.find((group) => group.id === id)?.name ?? `Group ${id}`;
  const assignedNames = (client: Client | null) => client?.groups.length ? client.groups.map(groupName).join(', ') : 'Default';

  const choose = (address: string) => {
    const row = deviceRows.find((device) => device.address === address || device.addresses.includes(address));
    const client = row?.client ?? inventory.data?.clients.find((candidate) => candidate.client === address) ?? null;
    select(address); setExpected(client); setGroups(client?.groups?.length ? client.groups : [0]); showHistory(false); setMessage(''); setError('');
  };
  const saveAssignment = async () => {
    if (!window.confirm(`Assign ${selected} to ${groups.map(groupName).join(', ')}? This changes live DNS filtering.`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await liveApi<{ message: string; verified: { clients: Client[] } }>('action', undefined, { action: 'client-assign', client: selected, groups, expected, confirmed: true });
      setExpected(result.verified.clients.find((client) => client.client === selected) ?? null); setMessage(result.message); refresh((r) => r + 1);
    } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  };

  return <div className="sph-devices">
    <div className="section-head"><div><p className="eyebrow">LIVE DEVICE CENTER</p><h1>Devices using Super Pi Hole</h1><p>Observed DNS clients and configured Pi-hole clients · refreshed every 5 seconds while visible.</p></div><Button variant="outline" onClick={() => refresh((r) => r + 1)}><RefreshCw />Refresh</Button></div>
    <p className="nc-review-strip">{inventory.data?.coverage ?? 'Waiting for the connected DNS engine. No example devices are used in this view.'} Devices using encrypted DNS, a VPN, another DNS server or only direct IP connections may not appear. Last seen is not proof a device is online now.</p>
    {(inventory.error || error) && <p role="alert" className="pc-error">{inventory.error || error}</p>}
    <section className="panel">
      <div className="section-head"><div><h2>Live inventory</h2><p>Click any row to inspect history or assign a family/profile group.</p></div><UsersRound /></div>
      <label>Find a device<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, IP, MAC or manufacturer" /></label>
      <div className="sph-device-table-wrap"><table className="data-table"><thead><tr><th>Device</th><th>Addresses</th><th>Family / profile</th><th>Last DNS request</th><th>Queries</th></tr></thead><tbody>
        {rows.map((device) => <tr key={device.key} className={selected === device.address ? 'selected' : ''} onClick={() => choose(device.address)}><td><Button variant="ghost"><Monitor />{device.name}</Button><small>{device.configuredOnly ? 'Configured manually' : device.hwaddr}</small></td><td>{device.addresses.join(', ')}</td><td><span className="badge">{assignedNames(device.client)}</span></td><td>{device.lastQuery ? new Date(device.lastQuery * 1000).toLocaleString() : 'Not recently observed'}</td><td>{device.numQueries.toLocaleString()}</td></tr>)}
      </tbody></table>{!rows.length && <p>No matching DNS clients. Use manual entry below if the device has not queried this Pi-hole yet.</p>}</div>
      {inventory.data && <small>Last inventory response: {new Date(inventory.data.fetchedAt).toLocaleTimeString()}</small>}
    </section>
    <section className="panel"><h2>Assign a device</h2><p>Select an observed client or enter an IPv4, IPv6 or MAC address. DHCP reservations give the most stable per-device filtering and history.</p>
      <div className="nc-two"><label>Observed or configured device<select value={selected} onChange={(event) => choose(event.target.value)}><option value="">Select a device…</option>{deviceRows.map((device) => <option key={device.key} value={device.address}>{device.name} — {device.address}</option>)}</select></label><label>Manual IP or MAC<input value={selected} onChange={(event) => choose(event.target.value)} placeholder="192.168.0.25 or AA:BB:CC:DD:EE:FF" /></label></div>
      {selected && <div className="sph-assignment-card"><div><h3>{selectedRow?.name ?? selected}</h3><p>Currently assigned: {assignedNames(expected)}</p></div>
        <label>Family member or filtering group<select value={groups.length === 1 ? groups[0] : ''} onChange={(event) => setGroups([Number(event.target.value)])}><option value="" disabled>{groups.length > 1 ? 'Multiple groups — use Advanced below' : 'Choose a group…'}</option>{enabledGroups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.id === 0 ? ' (default)' : ''}</option>)}</select></label>
        <div className="sph-device-actions"><Button disabled={busy || !status.data?.writeEnabled || !groups.length} onClick={() => void saveAssignment()}><Check />{busy ? 'Applying…' : 'Apply assignment'}</Button><Button variant="outline" onClick={() => showHistory((open) => !open)}>DNS history</Button></div>
        <details><summary>Advanced: assign multiple Pi-hole groups</summary><fieldset><legend>Live filtering groups</legend>{inventory.data?.groups.map((group) => <label key={group.id} className="sph-check-row"><input type="checkbox" checked={groups.includes(group.id)} onChange={(event) => setGroups(event.target.checked ? [...new Set([...groups, group.id])] : groups.filter((id) => id !== group.id))} /> {group.name}{!group.enabled && ' (disabled)'}</label>)}</fieldset></details><output className="pc-feedback" aria-live="polite">{message}</output>
      </div>}
    </section>
    {history && selected && <QueryLog key={selected} revision={revision} initial={{ client_ip: selected }} prepareRule={async (domain, type) => { if (!window.confirm(`${type === 'deny' ? 'Block' : 'Allow'} ${domain} for ${groups.map(groupName).join(', ')}? Other devices in these groups are also affected.`)) return; try { const result = await liveApi<{ message: string }>('action', undefined, { action: 'domain-add', domain, type, kind: 'exact', groups, enabled: true, comment: 'Super Pi Hole device history', confirmed: true }); setMessage(result.message); refresh((r) => r + 1); } catch (caught) { setError((caught as Error).message); } }} />}
  </div>;
}

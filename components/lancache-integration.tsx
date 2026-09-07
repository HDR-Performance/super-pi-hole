'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Link2, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { liveApi, useData } from './live-pihole';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { parseSetupCode, prepareSetup, presetServices, sameServerUrl } from '../lib/lancache-setup';

type Service = { id: string; name: string; domains: { type: 'exact' | 'wildcard'; domain: string }[] };
type State = {
  revision: number;
  enabled: boolean;
  managementUrl: string;
  hasToken: boolean;
  pairingToken: string;
  pinnedInstanceId: string | null;
  connection: { state: string; checkedAt: string | null; error: string | null; version: string | null; instanceId: string | null; capabilities: string[]; contentAddresses: { ipv4: string[]; ipv6: string[] }; peerManagementUrl: string | null };
  catalog: { revision: string; services: Service[] } | null;
  routes: { state: string; selectedServices: string[]; catalogRevision: string | null; managedLines: string[]; appliedAt: string | null; lastVerifiedAt: string | null };
};
type Preview = { configurationRevision: number; catalogRevision: string; selectedServices: string[]; add: string[]; remove: string[]; conflicts: string[]; routeCount: number; previewHash: string };

export function LanCacheIntegration() {
  const [tick, refresh] = useState(0), result = useData<State>('integrations/lancache', tick);
  const [enabled, setEnabled] = useState(false), [url, setUrl] = useState(''), [token, setToken] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [preview, setPreview] = useState<Preview | null>(null);
  const state = result.data;
  const [setupCode, setSetupCode] = useState(''), [preset, setPreset] = useState('steam');
  useEffect(() => { if (!state) return; setEnabled(state.enabled); setUrl(state.managementUrl || sameServerUrl(window.location.origin)); if (!preview) setSelected(state.routes.selectedServices); }, [state?.revision]);
  const run = async (operation: () => Promise<unknown>, success: string) => { setBusy(true); setError(''); setMessage(''); setPreview(null); try { await operation(); setMessage(success); refresh((n) => n + 1); } catch (caught) { setError((caught as Error).message); refresh((n) => n + 1); } finally { setBusy(false); } };
  const save = () => run(async () => {
    if (!enabled && state!.routes.state === 'applied' && !window.confirm('Disable the integration and remove its cache DNS routes? Downloads will use normal DNS after clients refresh their lookups.')) throw Error('Settings were not changed.');
    await liveApi('integrations/lancache/configure', undefined, { revision: state!.revision, enabled, managementUrl: url, pairingToken: token }); setToken('');
  }, enabled ? 'Integration settings saved. Test the connection next.' : 'Integration disabled. Any applied routes were removed.');
  const quickSetup = () => run(async () => {
    const code = setupCode.trim() ? parseSetupCode(setupCode) : undefined;
    const prepared = await prepareSetup<State, Preview>(<T,>(path: string, body?: unknown) => liveApi<T>(path, undefined, body), { code, managementUrl: url, pairingToken: token, preset });
    setToken(''); setSetupCode(''); setUrl(prepared.state.managementUrl); setEnabled(true); setSelected(prepared.preview.selectedServices); setPreview(prepared.preview);
  }, 'Connection verified. Review the prepared services below, then enable cache DNS.');
  const statusClass = ['Connected', 'Routes applied'].includes(state?.connection.state ?? '') ? 'selected' : '';
  return <div className="sph-lancache">
    <div className="section-head"><div><p className="eyebrow">SETTINGS / INTEGRATIONS / LANCACHE</p><h1>LanCache integration</h1><p>Optional pairing between two independent apps. Enabling communication never changes DNS by itself.</p></div><Link2 /></div>
    <div className="nc-review-strip"><ShieldCheck /><span>Pairing tokens stay encrypted on the Super Pi Hole server and are never returned to this browser. DNS routing requires a separate preview and confirmation.</span></div>
    {(result.error || error) && <p className="pc-error" role="alert">{result.error || error}</p>}
    <output className="pc-feedback" aria-live="polite">{message}</output>
    {!state ? <section className="panel"><p>Loading integration settings…</p></section> : <>
      <section className="panel">
        <div className="section-head"><div><h2>Quick setup</h2><p>On one server or across your LAN: copy a setup code from LanCache → Settings, paste it here, then review the prepared DNS rules.</p></div></div>
        <label>LanCache setup code<input type="password" autoComplete="off" spellCheck={false} value={setupCode} disabled={busy} onChange={event => { setSetupCode(event.target.value); setPreview(null); }} placeholder={state.hasToken ? 'Already paired — leave empty to use this connection' : 'Paste the complete code from LanCache Settings'} /></label>
        <label>Service preset<select value={preset} disabled={busy} onChange={event => { setPreset(event.target.value); setPreview(null); }}><option value="steam">Steam</option><option value="gaming">PC gaming</option><option value="all">All supported services</option></select></label>
        <p>Existing enabled services are preserved when adding a preset. The cache supplies its own addresses and current domain rules.</p>
        <div className="sph-actions"><Button disabled={busy || (!setupCode.trim() && !token && !state.hasToken)} onClick={quickSetup}>{busy ? 'Checking…' : 'Connect & prepare preset'}</Button><Button variant="outline" disabled={busy} onClick={() => { setUrl(sameServerUrl(window.location.origin)); setPreview(null); }}>Use this server :20722</Button>{url && /^https?:/.test(url) && <a className="button" href={url + (url.endsWith('/') ? '' : '/') + '#settings'} target="_blank" rel="noreferrer">Get setup code <ExternalLink /></a>}</div>
        <p><strong>Client DNS:</strong> devices must use Super Pi Hole as their DNS server. A VPN or encrypted DNS can bypass it. Fully restart Steam after enabling its cache rule.</p>
        <p>Both apps work independently. These presets are optional; neither app installs or requires the other.</p>
      </section>
      <section className="panel">
        <div className="section-head"><div><h2>Connection details</h2><p>Super Pi Hole remains fully functional when this integration is off or unavailable.</p></div><span className={`badge ${statusClass}`}>{state.connection.state}</span></div>
        <label className="sph-toggle-row"><span><strong>Enable LanCache integration</strong><small>Allows authenticated status and catalog reads only.</small></span><Switch checked={enabled} disabled={busy} onCheckedChange={setEnabled} /></label>
        <label>LanCache management URL<input value={url} disabled={busy} onChange={(event) => { setUrl(event.target.value); setPreview(null); }} placeholder="http://CACHE-SERVER-IP:20722/" /></label>
        <label>Pairing token<input type="password" autoComplete="new-password" value={token} disabled={busy} onChange={(event) => { setToken(event.target.value); setPreview(null); }} placeholder={state.hasToken ? 'Stored securely — enter only to replace' : 'Enter token from LanCache'} /></label>
        <div className="sph-actions"><Button disabled={busy} onClick={save}>Save integration settings</Button><Button variant="outline" disabled={busy || !state.enabled || !state.hasToken} onClick={() => run(() => liveApi('integrations/lancache/test', undefined, {}), 'LanCache identity, health and service catalog verified.')}><RefreshCw />Test connection</Button>{state.managementUrl && <a className="button" href={state.managementUrl} target="_blank" rel="noreferrer">Open LanCache <ExternalLink /></a>}</div>
        <dl className="sph-integration-facts"><div><dt>Instance</dt><dd>{state.pinnedInstanceId ?? 'Not paired'}</dd></div><div><dt>Version</dt><dd>{state.connection.version ?? 'Unknown'}</dd></div><div><dt>Last verified</dt><dd>{state.connection.checkedAt ? new Date(state.connection.checkedAt).toLocaleString() : 'Never'}</dd></div><div><dt>Cache addresses</dt><dd>{[...state.connection.contentAddresses.ipv4, ...state.connection.contentAddresses.ipv6].join(', ') || 'Unknown'}</dd></div></dl>
        {state.connection.error && <p className="pc-error">{state.connection.error}</p>}
        {state.hasToken && <Button variant="ghost" disabled={busy} onClick={() => { if (!window.confirm('Clear the stored pairing token and pinned LanCache identity? Applied DNS routes must be restored first.')) return; void run(() => liveApi('integrations/lancache/configure', undefined, { revision: state.revision, enabled: false, managementUrl: state.managementUrl, clearPairing: true }), 'Pairing cleared.'); }}>Clear pairing</Button>}
      </section>
      <section className="panel">
        <div className="section-head"><div><h2>DNS cache routing</h2><p>Select publisher services, preview exact Pi-hole dnsmasq changes, then apply. No route is created by pairing alone.</p></div><span className="badge">{state.routes.state === 'applied' ? `${state.routes.managedLines.length} managed lines` : 'No applied routes'}</span></div>
        {state.catalog ? <><div className="sph-actions"><Button variant="outline" disabled={busy} onClick={() => { setSelected(presetServices(preset, state.catalog!.services.map(s => s.id), selected)); setPreview(null); }}>Add preset to selection</Button></div><p>Catalog revision: <strong>{state.catalog.revision}</strong></p><div className="sph-service-grid">{state.catalog.services.map((service) => <label className="sph-policy-card" key={service.id}><span><input type="checkbox" checked={selected.includes(service.id)} disabled={busy} onChange={(event) => { setSelected(event.target.checked ? [...new Set([...selected, service.id])] : selected.filter((id) => id !== service.id)); setPreview(null); }} /> <strong>{service.name}</strong></span><small>{service.domains.length.toLocaleString()} validated domain rules</small></label>)}</div>
          <div className="sph-actions"><Button variant="outline" disabled={busy} onClick={() => run(async () => { const plan = await liveApi<Preview>('integrations/lancache/preview', undefined, { selectedServices: selected }); setPreview(plan); }, 'Route preview generated; DNS is unchanged.')}>Preview routes</Button>{state.routes.state === 'applied' && <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm('Restore DNS by removing only routes owned by this LanCache integration?')) void run(() => liveApi('integrations/lancache/rollback', undefined, { revision: state.revision }), 'Owned LanCache routes removed and verified.'); }}><RotateCcw />Restore routes</Button>}</div>
        </> : <p>Test a compatible paired LanCache to load its real revisioned service catalog. No example services are shown.</p>}
        {preview && <div className="sph-route-preview"><h3>Route preview</h3><p><strong>{preview.routeCount.toLocaleString()}</strong> domain routes · {preview.add.length.toLocaleString()} lines added · {preview.remove.length.toLocaleString()} lines removed</p>{preview.conflicts.length ? <p className="pc-error">{preview.conflicts.length} unmanaged Pi-hole rules overlap this plan. Apply is blocked.</p> : <p>No overlapping unmanaged dnsmasq lines detected.</p>}<details><summary>Review generated changes</summary><h4>Add</h4><pre>{preview.add.join('\n') || 'None'}</pre><h4>Remove</h4><pre>{preview.remove.join('\n') || 'None'}</pre></details><Button disabled={busy || !!preview.conflicts.length} onClick={() => { if (window.confirm(`Apply ${preview.routeCount} LanCache domain routes to Pi-hole? This changes live DNS.`)) void run(() => liveApi('integrations/lancache/apply', undefined, { revision: preview.configurationRevision, selectedServices: preview.selectedServices, previewHash: preview.previewHash }), 'LanCache DNS routes applied and read back from Pi-hole.'); }}>Enable reviewed cache DNS</Button></div>}
      </section>
    </>}
  </div>;
}

'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Checkbox } from './ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from './ui/alert-dialog';
import { Choice, TextField } from './review-context';
import { liveApi, useData, type Pending } from './live-pihole';
import { EngineSettings } from './engine-settings';
import { validateSetting } from '@/lib/engine-settings.mjs';

type Value = string | number | boolean | string[];
type Setting = {
  path: string;
  value: Value;
  default: Value;
  type: string;
  description: string;
  allowed: null | string | { item: string | number; description: string }[];
  flags: { env_var?: boolean; restart_dnsmasq?: boolean };
  editable: boolean;
};
const labels: Record<string, string> = {
  'dns.upstreams': 'Upstream DNS servers',
  'dns.dnssec': 'Validate DNSSEC',
  'dns.queryLogging': 'Log DNS queries',
  'dns.domainNeeded': 'Do not forward single-label hostnames',
  'dns.bogusPriv': 'Do not forward private reverse lookups',
  'dns.cache.size': 'DNS cache size',
  'dns.revServers': 'Conditional forwarding',
  'dns.cnameRecords': 'CNAME aliases',
  'dns.hosts': 'Local host records',
  'dns.rateLimit.count': 'Queries per rate-limit window',
  'dns.rateLimit.interval': 'Rate-limit window (seconds)',
  'dhcp.active': 'Enable Pi-hole DHCP server',
  'dhcp.start': 'First DHCP address',
  'dhcp.end': 'Last DHCP address',
  'dhcp.router': 'Router / gateway address',
  'dhcp.netmask': 'Subnet mask',
  'dhcp.leaseTime': 'Lease duration',
  'dhcp.ipv6': 'IPv6 router advertisements',
  'dhcp.hosts': 'Static DHCP reservations',
  'misc.privacylevel': 'DNS history privacy level',
  'database.maxDBdays': 'Days of DNS history to retain',
};
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function SettingsForm({
  revision,
  locked,
  confirm,
}: {
  revision: number;
  locked: boolean;
  confirm: (p: Pending) => void;
}) {
  const { data, error } = useData<{ fields: Setting[] }>('settings', revision);
  const [filter, setFilter] = useState(''),
    [topic, setTopic] = useState('common');
  const [changes, setChanges] = useState<
    Record<string, { value: Value; expected: Value }>
  >({});
  const [acknowledged, setAcknowledged] = useState(false);
  const fields = data?.fields ?? [];
  const staged = Object.entries(changes).filter(
    ([, c]) => !equal(c.value, c.expected),
  );
  const invalid = staged.some(([path, c]) => {
    const field = fields.find((f) => f.path === path);
    return !field || !!validateSetting(field, c.value);
  });
  const dhcpStart =
    changes['dhcp.active']?.value === true &&
    changes['dhcp.active']?.expected !== true;
  const setValue = (field: Setting, value: Value) =>
    setChanges((c) => ({
      ...c,
      [field.path]: { value, expected: c[field.path]?.expected ?? field.value },
    }));
  const visible = fields.filter(
    (f) =>
      (topic === 'all' ||
        (topic === 'common'
          ? Object.hasOwn(labels, f.path)
          : f.path.startsWith(topic + '.'))) &&
      `${labels[f.path] ?? ''} ${f.path} ${f.description}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  return (
    <section className="panel sph-settings-form">
      <h2>DNS, DHCP & privacy settings</h2>
      <p>
        Values and supported choices come from your running Pi-hole. Only
        changes you review are saved.
      </p>
      <div className="sph-actions">
        <Choice
          label="Show settings"
          value={topic}
          onChange={setTopic}
          options={[
            { value: 'common', label: 'Everyday controls' },
            { value: 'all', label: 'All engine controls' },
            ...['dns', 'dhcp', 'resolver', 'database', 'ntp', 'misc'].map(
              (value) => ({
                value,
                label: value === 'misc' ? 'Privacy' : value.toUpperCase(),
              }),
            ),
          ]}
        />
        <TextField
          id="setting-search"
          label="Find a setting"
          value={filter}
          onChange={setFilter}
          placeholder="DNSSEC, DHCP, privacy…"
        />
      </div>
      {error && (
        <p role="alert" className="pc-error">
          {error}
        </p>
      )}
      {!data && !error && <p>Reading engine settings…</p>}
      <div className="sph-setting-grid">
        {visible.map((field) => {
          const value = changes[field.path]?.value ?? field.value;
          const problem = validateSetting(field, value);
          const disabled = locked || !field.editable;
          const title = labels[field.path] ?? field.path;
          const id = 'engine-' + field.path;
          return (
            <section className="sph-setting" key={field.path}>
              <label htmlFor={id}>
                <strong>{title}</strong>
              </label>
              <small>{field.path}</small>
              {typeof value === 'boolean' ? (
                <Switch
                  id={id}
                  checked={value}
                  disabled={disabled}
                  onCheckedChange={(v) => setValue(field, v)}
                />
              ) : Array.isArray(field.allowed) ? (
                <Choice
                  label={title}
                  disabled={disabled}
                  value={String(value)}
                  onChange={(v) =>
                    setValue(
                      field,
                      typeof field.value === 'number' ? Number(v) : v,
                    )
                  }
                  options={field.allowed.map((option) => ({
                    value: String(option.item),
                    label: `${option.item} — ${option.description}`,
                  }))}
                />
              ) : Array.isArray(value) ? (
                <Textarea
                  id={id}
                  disabled={disabled}
                  value={value.join('\n')}
                  rows={4}
                  onChange={(e) => setValue(field, e.target.value.split('\n'))}
                  onBlur={() =>
                    setValue(
                      field,
                      value
                        .filter((line) => line.trim())
                        .map((line) => line.trim()),
                    )
                  }
                  aria-describedby={id + '-help'}
                />
              ) : (
                <Input
                  id={id}
                  disabled={disabled}
                  type={typeof field.value === 'number' ? 'number' : 'text'}
                  step={field.type === 'double' ? 'any' : '1'}
                  value={
                    typeof value === 'number' && !Number.isFinite(value)
                      ? ''
                      : String(value)
                  }
                  onChange={(e) =>
                    setValue(
                      field,
                      typeof field.value === 'number'
                        ? e.target.value === ''
                          ? NaN
                          : Number(e.target.value)
                        : e.target.value,
                    )
                  }
                  aria-describedby={id + '-help'}
                />
              )}
              {Array.isArray(value) && (
                <small>
                  One entry per line. Leave empty to clear this list.
                </small>
              )}
              <details id={id + '-help'}>
                <summary>What this setting does</summary>
                <p>{field.description}</p>
                {typeof field.allowed === 'string' && <p>{field.allowed}</p>}
              </details>
              {!field.editable && (
                <p>
                  Managed by the installation
                  {field.flags.env_var ? ' environment' : ''}; read-only here.
                </p>
              )}
              {field.flags.restart_dnsmasq && (
                <small>Changing this may restart DNS.</small>
              )}
              {problem && <p className="pc-error">{problem}</p>}
            </section>
          );
        })}
      </div>
      {data && !visible.length && <p>No matching settings.</p>}
      {dhcpStart && (
        <label className="sph-check" htmlFor="dhcp-enable-ack">
          <Checkbox
            id="dhcp-enable-ack"
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
          />
          I have disabled the competing DHCP server on my router and reviewed
          the address range. Enabling two DHCP servers can disrupt the network.
        </label>
      )}
      <div className="sph-actions">
        <Button
          disabled={
            locked || !staged.length || invalid || (dhcpStart && !acknowledged)
          }
          onClick={() =>
            confirm({
              title: `Save ${staged.length} engine setting${staged.length === 1 ? '' : 's'}?`,
              description:
                'Only the listed settings will change. DNS, DHCP and resolver changes can interrupt connectivity. Export a Teleporter backup first. The server will reject stale or installation-managed values.',
              body: {
                action: 'settings-save',
                changes: staged.map(([path, c]) => ({ path, ...c })),
                dhcpAcknowledged: acknowledged,
              },
            })
          }
        >
          Review {staged.length || ''} changes
        </Button>
        <Button
          variant="outline"
          disabled={!staged.length}
          onClick={() => setChanges({})}
        >
          Discard edits
        </Button>
      </div>
      {!!staged.length && (
        <ul>
          {staged.map(([path]) => (
            <li key={path}>{labels[path] ?? path}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Values({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>Not reported</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'string' || typeof value === 'number')
    return <span>{value}</span>;
  if (typeof value !== 'object') return <span>Not reported</span>;
  return (
    <dl className="sph-values">
      {Object.entries(value).map(([key, item]) => (
        <div key={key}>
          <dt>{key.replaceAll('_', ' ')}</dt>
          <dd>
            {typeof item === 'object' && item !== null ? (
              <details>
                <summary>
                  {Array.isArray(item) ? `${item.length} entries` : 'Details'}
                </summary>
                <Values value={item} />
              </details>
            ) : (
              <Values value={item} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Diagnostics({
  revision,
  locked,
  confirm,
}: {
  revision: number;
  locked: boolean;
  confirm: (p: Pending) => void;
}) {
  const { data, error } = useData<{
    data: Record<string, unknown>;
    errors: Record<string, string>;
    fetchedAt: string;
  }>('diagnostics', revision);
  const [logFile, setLogFile] = useState('ftl'),
    [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [partial, setPartial] = useState(false);
  const [operation, setOperation] = useState('restartdns'),
    [ack, setAck] = useState('');
  const [follow, setFollow] = useState(false),
    [logTick, setLogTick] = useState(0);
  useEffect(() => {
    if (!follow) return;
    const timer = setInterval(() => {
      if (!document.hidden) setLogTick((n) => n + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, [follow]);
  const logs = useData<{ log: { timestamp: number; message: string }[] }>(
    'logs?file=' + logFile,
    revision + logTick,
  );
  const matches = useData<{
    search: { domains: unknown[]; gravity: unknown[] };
  }>(
    term
      ? `search-lists?domain=${encodeURIComponent(term)}&partial=${partial}`
      : 'version',
    revision,
  );
  const leases = useData<{
    leases: { ip: string; hwaddr: string; name: string; expires: number }[];
  }>('leases', revision);
  return (
    <div className="sph-diagnostics">
      <section className="panel">
        <h2>Why is this domain blocked?</h2>
        <form
          className="sph-actions"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(search.trim());
          }}
        >
          <TextField
            id="engine-search-domain"
            label="Domain to search"
            value={search}
            onChange={setSearch}
            placeholder="example.com"
          />
          <label className="sph-check" htmlFor="list-partial-match">
            <Checkbox
              id="list-partial-match"
              checked={partial}
              onCheckedChange={(v) => setPartial(v === true)}
            />
            Partial matches
          </label>
          <Button disabled={!search.trim()}>Search rules & lists</Button>
        </form>
        <p>
          Matches are evidence from Pi-hole’s lists, not a per-device verdict.
          Group assignments, allow rules and query status also affect the
          result.
        </p>
        {term && matches.error && (
          <p role="alert" className="pc-error">
            {matches.error}
          </p>
        )}
        {term && matches.data?.search && (
          <>
            <h3>Local domain rules</h3>
            <Values value={matches.data.search.domains} />
            <h3>Subscription matches</h3>
            <Values value={matches.data.search.gravity} />
          </>
        )}
      </section>
      <section className="panel">
        <h2>Engine & network health</h2>
        {error && (
          <p role="alert" className="pc-error">
            {error}
          </p>
        )}
        {Object.entries(data?.errors ?? {}).map(([key, value]) => (
          <p className="pc-error" key={key}>
            {key}: {value}
          </p>
        ))}
        {(() => {
          const messages = (
            data?.data.messages as
              | { messages?: { id: number; plain: string; type: string }[] }
              | undefined
          )?.messages;
          return (
            messages && (
              <section>
                <h3>Pi-hole diagnostic messages</h3>
                {!messages.length && <p>No diagnostic messages reported.</p>}
                {messages.map((m) => (
                  <div key={m.id}>
                    <p>
                      <strong>{m.type}</strong> · {m.plain}
                    </p>
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() =>
                        confirm({
                          title: 'Dismiss diagnostic message?',
                          description:
                            m.plain +
                            ' Dismissing the message does not fix its cause.',
                          body: { action: 'message-dismiss', id: m.id },
                        })
                      }
                    >
                      Dismiss message
                    </Button>
                  </div>
                ))}
              </section>
            )
          );
        })()}
        {Object.entries(data?.data ?? {})
          .filter(([key]) => key !== 'messages')
          .map(([key, value]) => (
            <details key={key}>
              <summary>{key}</summary>
              <Values value={value} />
            </details>
          ))}
      </section>
      <section className="panel">
        <h2>DNS engine logs</h2>
        <Choice
          label="Log file"
          value={logFile}
          onChange={setLogFile}
          options={[
            { value: 'ftl', label: 'FTL engine' },
            { value: 'dnsmasq', label: 'DNS queries' },
            { value: 'webserver', label: 'Web server' },
          ]}
        />
        <p>
          Latest 300 returned entries. Use Refresh or follow every 5 seconds.
          Logs stay on your network; do not share them publicly without checking
          their contents.
        </p>
        <label className="sph-check" htmlFor="follow-engine-log">
          <Switch
            id="follow-engine-log"
            checked={follow}
            onCheckedChange={setFollow}
          />
          Follow log (pauses while this browser tab is hidden)
        </label>
        {logs.error && (
          <p role="alert" className="pc-error">
            {logs.error}
          </p>
        )}
        <pre className="sph-log-view">
          {logs.data?.log
            .map(
              (line) =>
                `${new Date(line.timestamp * 1000).toLocaleString()} ${line.message}`,
            )
            .join('\n') || 'No log entries returned.'}
        </pre>
      </section>
      <section className="panel">
        <h2>Active Pi-hole DHCP leases</h2>
        <p>
          These are leases issued by Pi-hole, not your router’s device
          inventory. Keep DHCP disabled here if your router provides it.
        </p>
        {leases.error && (
          <p role="alert" className="pc-error">
            {leases.error}
          </p>
        )}
        <div className="sph-scroll-table">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>IP address</th>
                <th>MAC address</th>
                <th>Expires</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {leases.data?.leases.map((lease) => (
                <tr key={lease.ip}>
                  <td>{lease.name || 'Unnamed'}</td>
                  <td>{lease.ip}</td>
                  <td>{lease.hwaddr}</td>
                  <td>
                    {lease.expires === 0
                      ? 'Never'
                      : new Date(lease.expires * 1000).toLocaleString()}
                  </td>
                  <td>
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() =>
                        confirm({
                          title: 'Remove this DHCP lease?',
                          description:
                            'This removes the current lease record. It does not block the device, and the device may request a new address.',
                          body: {
                            action: 'lease-delete',
                            ip: lease.ip,
                            expected: lease,
                          },
                        })
                      }
                    >
                      Remove lease
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leases.data?.leases.length === 0 && <p>No Pi-hole leases returned.</p>}
      </section>
      <section className="panel">
        <h2>Maintenance</h2>
        <p>
          These operations can interrupt DNS or remove stored history. They do
          not upgrade application code.
        </p>
        <Choice
          label="Operation"
          value={operation}
          onChange={(v) => {
            setOperation(v);
            setAck('');
          }}
          options={[
            {
              value: 'restartdns',
              label: 'Restart DNS resolver / clear DNS cache',
            },
            { value: 'flush-logs', label: 'Erase DNS query logs' },
            { value: 'flush-network', label: 'Clear network-device table' },
            { value: 'flush-arp', label: 'Clear neighbor / ARP cache' },
          ]}
        />
        <TextField
          id="maintenance-confirm"
          label={`Type ${operation} to confirm`}
          value={ack}
          onChange={setAck}
        />
        <Button
          variant="outline"
          disabled={locked || ack !== operation}
          onClick={() =>
            confirm({
              title: 'Run ' + operation + '?',
              description:
                operation === 'restartdns'
                  ? 'DNS resolution may be temporarily unavailable while the engine restarts.'
                  : 'This removes the selected records/cache. Export or back up anything you need first; this action is not an undoable UI edit.',
              body: { action: 'maintenance', operation, acknowledgement: ack },
            })
          }
        >
          Review maintenance
        </Button>
      </section>
    </div>
  );
}

export function EngineWorkbench() {
  const [settingsReset, setSettingsReset] = useState(0);
  const [revision, refresh] = useState(0),
    [tab, setTab] = useState('settings'),
    [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const status = useData<{ writeEnabled: boolean; adminUrl: string | null }>(
    'status',
    revision,
  );
  const locked = busy || !status.data?.writeEnabled;
  return (
    <div className="sph-live sph-workbench">
      <div className="section-head">
        <div>
          <p className="eyebrow">SUPER PI HOLE / ENGINE CONTROLS</p>
          <h1>Settings & diagnostics</h1>
          <p>Pi-hole’s working engine, with clearer controls.</p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => refresh((r) => r + 1)}
        >
          Refresh
        </Button>
      </div>
      <p className="nc-review-strip">
        Changes affect the connected DNS engine after confirmation.
        Installation-managed listeners, passwords and filesystem paths remain
        protected.
      </p>
      <output aria-live="polite">{message}</output>
      {(error || status.error) && (
        <p role="alert" className="pc-error">
          {error || status.error}
        </p>
      )}
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList className="sph-tabs">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics & tools</TabsTrigger>
          <TabsTrigger value="backup">Backups</TabsTrigger>
          <TabsTrigger value="expert">Advanced manager</TabsTrigger>
        </TabsList>
        <TabsContent value="settings">
          <SettingsForm
            key={settingsReset}
            revision={revision}
            locked={locked}
            confirm={setPending}
          />
        </TabsContent>
        <TabsContent value="diagnostics">
          <Diagnostics
            revision={revision}
            locked={locked}
            confirm={setPending}
          />
        </TabsContent>
        <TabsContent value="backup">
          <section className="panel">
            <h2>Export Pi-hole settings</h2>
            <p>
              Save a Teleporter ZIP before changing your setup. It is not a full
              query-history or TrueNAS dataset backup.
            </p>
            <a href="/live-api/teleporter" download>
              Download Teleporter backup
            </a>
            <p>
              Restoring arbitrary engine configuration is not enabled yet: an
              archive could overwrite the integrated listener and authentication
              settings. Keep dataset snapshots for full rollback.
            </p>
          </section>
        </TabsContent>
        <TabsContent value="expert">
          <EngineSettings />
        </TabsContent>
      </Tabs>
      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending?.body.action === 'settings-save' &&
            Array.isArray(pending.body.changes) && (
              <div className="sph-change-review">
                <table>
                  <thead>
                    <tr>
                      <th>Setting</th>
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      pending.body.changes as {
                        path: string;
                        expected: Value;
                        value: Value;
                      }[]
                    ).map((c) => (
                      <tr key={c.path}>
                        <td>{labels[c.path] ?? c.path}</td>
                        <td>
                          <Values value={c.expected} />
                        </td>
                        <td>
                          <Values value={c.value} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              disabled={locked || !pending}
              onClick={async () => {
                if (!pending || busy) return;
                setBusy(true);
                setError('');
                setMessage('');
                try {
                  const result = await liveApi<{ message: string }>(
                    'action',
                    undefined,
                    { ...pending.body, confirmed: true },
                  );
                  setMessage(result.message);
                  if (pending.body.action === 'settings-save')
                    setSettingsReset((n) => n + 1);
                  setPending(null);
                  refresh((r) => r + 1);
                } catch (e) {
                  setError((e as Error).message);
                  setPending(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Applying…' : 'Apply to DNS engine'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

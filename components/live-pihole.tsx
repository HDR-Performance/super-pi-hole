'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { RefreshCw, ExternalLink, LockKeyhole } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from './ui/alert-dialog';
import { Choice, TextField, Empty } from './review-context';
import { DnsMetrics, DnsVisuals, type DashboardData } from './dns-visuals';
import { PrivacyPacks } from './privacy-packs';
import type { QueryFocus } from '@/lib/dns-charts';

type Status = {
  configured: boolean;
  writeEnabled: boolean;
  adminUrl: string | null;
  controlled?: boolean;
};
type Query = {
  id: number;
  time: number;
  domain: string;
  type: string;
  status: string;
  client: { ip: string; name: string | null };
  reply?: { type: string; time: number };
};
type Rule = {
  id: number;
  domain: string;
  type: string;
  kind: string;
  enabled: boolean;
  groups: number[];
  comment: string | null;
};
type Group = {
  id: number;
  name: string;
  enabled: boolean;
  comment: string | null;
};
type List = {
  id: number;
  address: string;
  type: string;
  enabled: boolean;
  groups: number[];
  comment: string | null;
  number: number;
};
type Client = {
  id: number;
  client: string;
  groups: number[];
  comment: string | null;
};
type Overview = {
  fetchedAt: string;
  errors: Record<string, string>;
  data: DashboardData & {
    blocking?: { blocking: string; timer: number | null };
    topClients?: { clients: { ip: string; name: string; count: number }[] };
    topDomains?: { domains: { domain: string; count: number }[] };
    topBlocked?: { domains: { domain: string; count: number }[] };
  };
};
export type Pending = {
  title: string;
  description: string;
  body: Record<string, unknown>;
};
async function liveApi<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch('/live-api/' + path, {
    cache: 'no-store',
    signal,
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Super-Pihole-Review': '1',
          },
          body: JSON.stringify(body),
        }),
  });
  if (response.status === 401)
    window.dispatchEvent(new Event('super-pi-hole-session-expired'));
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw Error(result.error ?? 'Pi-hole request failed.');
  return result as T;
}
function useData<T>(path: string, revision: number) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError('');
    liveApi<T>(path, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [path, revision]);
  return { data, error };
}
function DataState({
  error,
  loaded,
  children,
}: {
  error: string;
  loaded: boolean;
  children: ReactNode;
}) {
  return error ? (
    <p role="alert" className="pc-error">
      {error}
    </p>
  ) : loaded ? (
    children
  ) : (
    <p role="status" className="nc-empty">
      Reading Pi-hole…
    </p>
  );
}
function Grid({
  headers,
  rows,
  empty = 'No records returned by Pi-hole.',
}: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  return rows.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => (
              <TableCell key={j}>{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ) : (
    <Empty>{empty}</Empty>
  );
}
const number = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : 'Unavailable';

function LiveOverview({
  revision,
  locked,
  confirm,
  focus,
  showLists,
}: {
  revision: number;
  locked: boolean;
  confirm: (p: Pending) => void;
  focus: (filter: QueryFocus) => void;
  showLists: () => void;
}) {
  const { data, error } = useData<Overview>('overview', revision);
  const [duration, setDuration] = useState('300');
  const d = data?.data;
  return (
    <DataState error={error} loaded={!!data}>
      {data && (
        <>
          <p className="nc-muted">
            Retrieved {new Date(data.fetchedAt).toLocaleString()}. DNS
            statistics cover Pi-hole’s current reporting window.
          </p>
          {Object.entries(data.errors).map(([key, value]) => (
            <p className="pc-error" key={key}>
              {key}: {value}
            </p>
          ))}
          <DnsMetrics data={d ?? {}} focus={focus} showLists={showLists} />
          <section className="panel">
            <div className="section-head">
              <h2>DNS blocking</h2>
              <span
                className={
                  'badge ' +
                  (d?.blocking?.blocking === 'enabled' ? 'green' : 'amber')
                }
              >
                {d?.blocking?.blocking ?? 'Unknown'}
              </span>
            </div>
            {d?.blocking?.timer != null && (
              <p>
                Pi-hole will switch blocking state in approximately{' '}
                {Math.ceil(d.blocking.timer)} seconds.
              </p>
            )}
            <div className="sph-actions">
              <Button
                disabled={locked || !d?.blocking}
                onClick={() =>
                  confirm({
                    title: 'Enable live DNS blocking?',
                    description:
                      'Enable your existing Pi-hole’s rules for all clients using it. This is a real network change and cancels its current timer.',
                    body: { action: 'blocking', blocking: true, timer: null },
                  })
                }
              >
                Enable blocking
              </Button>
              <Choice
                label="Pause duration"
                value={duration}
                onChange={setDuration}
                options={[
                  { value: '60', label: '1 minute' },
                  { value: '300', label: '5 minutes' },
                  { value: '3600', label: '1 hour' },
                  { value: 'permanent', label: 'Until manually enabled' },
                ]}
              />
              <Button
                variant="outline"
                disabled={locked || !d?.blocking}
                onClick={() =>
                  confirm({
                    title: 'Pause live DNS blocking?',
                    description:
                      duration === 'permanent'
                        ? 'Disable Pi-hole blocking until you manually enable it again. This affects every client using this Pi-hole.'
                        : `Disable Pi-hole blocking for ${Number(duration) / 60} minutes. Pi-hole will enable blocking afterwards, even if it was already disabled.`,
                    body: {
                      action: 'blocking',
                      blocking: false,
                      timer: duration === 'permanent' ? null : Number(duration),
                    },
                  })
                }
              >
                Pause blocking
              </Button>
            </div>
          </section>
          <DnsVisuals data={d ?? {}} focus={focus} />
          <section className="panel">
            <h2>Top DNS clients</h2>
            <Grid
              headers={['Client', 'Queries', 'Activity']}
              rows={(d?.topClients?.clients ?? []).map((c) => [
                <span>
                  {c.name || c.ip}
                  <small className="sph-sub">{c.ip}</small>
                </span>,
                number(c.count),
                <Button
                  variant="outline"
                  onClick={() => focus({ client_ip: c.ip })}
                >
                  View queries
                </Button>,
              ])}
            />
          </section>
          <div className="nc-two">
            {[
              ['Top permitted domains', d?.topDomains?.domains, 'permitted'],
              ['Top blocked domains', d?.topBlocked?.domains, 'blocklist'],
            ].map(([title, entries, upstream]) => (
              <section className="panel" key={String(title)}>
                <h2>{String(title)}</h2>
                <Grid
                  headers={['Domain', 'Queries']}
                  rows={(
                    (entries ?? []) as { domain: string; count: number }[]
                  ).map((row) => [
                    <button
                      className="sph-domain-link"
                      onClick={() =>
                        focus({
                          domain: row.domain,
                          upstream: String(upstream),
                        })
                      }
                    >
                      {row.domain} ↗
                    </button>,
                    <span className="sph-rank">
                      <span
                        style={{
                          width: `${Math.min(100, (row.count / Math.max(1, ...((entries ?? []) as { count: number }[]).map((r) => r.count))) * 100)}%`,
                        }}
                      />
                      {number(row.count)}
                    </span>,
                  ])}
                />
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>Upstream DNS performance</h2>
            <Grid
              headers={['Resolver or result', 'Queries', 'Mean response']}
              rows={(d?.upstreams?.upstreams ?? []).map((u) => [
                u.name || u.ip,
                number(u.count),
                u.statistics?.response
                  ? `${(u.statistics.response * 1000).toFixed(1)} ms`
                  : 'Not applicable',
              ])}
            />
          </section>
        </>
      )}
    </DataState>
  );
}
function QueryLog({
  revision,
  initial,
  prepareRule,
}: {
  revision: number;
  initial: QueryFocus;
  prepareRule: (domain: string, type: string) => void;
}) {
  const [domain, setDomain] = useState(initial.domain ?? ''),
    [client, setClient] = useState(initial.client_ip ?? ''),
    [result, setResult] = useState(initial.upstream ?? 'all'),
    [type, setType] = useState(initial.type ?? ''),
    [range, setRange] = useState({ from: initial.from, until: initial.until }),
    [query, setQuery] = useState(new URLSearchParams(initial).toString()),
    [cursor, setCursor] = useState('');
  const request = new URLSearchParams(query);
  if (cursor) request.set('cursor', cursor);
  const { data, error } = useData<{
    queries: Query[];
    cursor: number | null;
    fetchedAt: string;
  }>('queries?' + request, revision);
  return (
    <section className="panel">
      <h2>Query log</h2>
      <p>
        These are DNS requests, not proof that a website was visited. Encrypted
        DNS and direct-IP traffic may be absent.
      </p>
      {range.from && (
        <div className="sph-actions">
          <p>
            Chart interval:{' '}
            {new Date(Number(range.from) * 1000).toLocaleString()}
            {range.until
              ? ` – ${new Date(Number(range.until) * 1000).toLocaleString()}`
              : ' onward'}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setRange({ from: undefined, until: undefined });
              setCursor('');
              const p = new URLSearchParams(query);
              p.delete('from');
              p.delete('until');
              setQuery(p.toString());
            }}
          >
            Clear interval
          </Button>
        </div>
      )}
      <form
        className="sph-actions"
        onSubmit={(e) => {
          e.preventDefault();
          setCursor('');
          const p = new URLSearchParams();
          if (domain.trim()) p.set('domain', domain.trim());
          if (client.trim()) p.set('client_ip', client.trim());
          if (type.trim()) p.set('type', type.trim().toUpperCase());
          if (result !== 'all') p.set('upstream', result);
          if (range.from) p.set('from', range.from);
          if (range.until) p.set('until', range.until);
          setQuery(p.toString());
        }}
      >
        <TextField
          id="live-domain-filter"
          label="Domain (* wildcard supported)"
          value={domain}
          onChange={setDomain}
          placeholder="*.example.com"
        />
        <TextField
          id="live-client-filter"
          label="Client IP"
          value={client}
          onChange={setClient}
          placeholder="192.0.2.20"
        />
        <TextField
          id="live-type-filter"
          label="DNS record type"
          value={type}
          onChange={setType}
          placeholder="All types"
        />
        <Choice
          label="Result"
          value={result}
          onChange={setResult}
          options={[
            { value: 'all', label: 'All results' },
            { value: 'blocklist', label: 'Blocked' },
            { value: 'permitted', label: 'Permitted' },
            { value: 'cache', label: 'Cached' },
            ...(!['all', 'blocklist', 'permitted', 'cache'].includes(result)
              ? [{ value: result, label: result }]
              : []),
          ]}
        />
        <Button type="submit">Apply filters</Button>
      </form>
      <DataState error={error} loaded={!!data}>
        {data && (
          <>
            <Grid
              headers={[
                'Time',
                'Client',
                'Domain / type',
                'Status / reply',
                'Domain rule',
              ]}
              rows={data.queries.map((q) => [
                new Date(q.time * 1000).toLocaleTimeString(),
                <span>
                  {q.client?.name || q.client?.ip}
                  <small className="sph-sub">{q.client?.ip}</small>
                </span>,
                <span>
                  {q.domain}
                  <small className="sph-sub">{q.type}</small>
                </span>,
                <span>
                  {q.status ?? 'Unknown'}
                  <small className="sph-sub">{q.reply?.type}</small>
                </span>,
                <div className="sph-actions">
                  <Button
                    variant="outline"
                    onClick={() => prepareRule(q.domain, 'allow')}
                  >
                    Allow…
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => prepareRule(q.domain, 'deny')}
                  >
                    Block…
                  </Button>
                </div>,
              ])}
            />
            <div className="sph-actions">
              <Button
                variant="outline"
                disabled={!cursor}
                onClick={() => setCursor('')}
              >
                Newest
              </Button>
              <Button
                variant="outline"
                disabled={
                  !data.queries.length ||
                  data.cursor == null ||
                  String(data.cursor) === cursor
                }
                onClick={() => setCursor(String(data.cursor))}
              >
                Older queries
              </Button>
              <small>
                Up to 100 requests per page ·{' '}
                {new Date(data.fetchedAt).toLocaleTimeString()}
              </small>
            </div>
          </>
        )}
      </DataState>
    </section>
  );
}
function DomainRules({
  revision,
  locked,
  confirm,
  seed,
}: {
  revision: number;
  locked: boolean;
  confirm: (p: Pending) => void;
  seed: { domain: string; type: string };
}) {
  const { data, error } = useData<{ domains: Rule[] }>('domains', revision);
  const groups = useData<{ groups: Group[] }>('groups', revision);
  const [domain, setDomain] = useState(seed.domain),
    [type, setType] = useState(seed.type),
    [kind, setKind] = useState('exact'),
    [comment, setComment] = useState(''),
    [selected, setSelected] = useState<number[]>([0]),
    [filter, setFilter] = useState('');
  const options = groups.data?.groups ?? [];
  const groupLabel = (ids: number[]) =>
    ids
      .map((id) => options.find((g) => g.id === id)?.name ?? `Group ${id}`)
      .join(', ');
  return (
    <section className="panel">
      <h2>Allowlist & denylist</h2>
      <p>
        These rules belong to your existing Pi-hole, separate from the Super Pi
        Hole policy simulator.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirm({
            title: `Add live ${type === 'allow' ? 'allow' : 'block'} rule?`,
            description: `${kind} rule: ${domain}. Applies to Pi-hole groups: ${groupLabel(selected)}. It is not automatically limited to the device you selected in the query log.`,
            body: {
              action: 'domain-add',
              domain,
              type,
              kind,
              comment,
              groups: selected,
            },
          });
        }}
      >
        <div className="sph-actions">
          <TextField
            id="live-rule-domain"
            label="Domain or POSIX regular expression"
            value={domain}
            onChange={setDomain}
          />
          <Choice
            label="Action"
            value={type}
            onChange={setType}
            options={[
              { value: 'deny', label: 'Block' },
              { value: 'allow', label: 'Allow' },
            ]}
          />
          <Choice
            label="Match"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'exact', label: 'Exact hostname' },
              { value: 'regex', label: 'Regular expression' },
            ]}
          />
        </div>
        <TextField
          id="live-rule-comment"
          label="Comment"
          value={comment}
          onChange={setComment}
        />
        <fieldset className="sph-groups">
          <legend>Existing Pi-hole groups</legend>
          {options.map((g) => (
            <label key={g.id}>
              <Checkbox
                checked={selected.includes(g.id)}
                onCheckedChange={(checked) =>
                  setSelected((old) =>
                    checked
                      ? [...new Set([...old, g.id])]
                      : old.filter((id) => id !== g.id),
                  )
                }
              />
              {g.name}
              {!g.enabled && ' (disabled)'}
            </label>
          ))}
        </fieldset>
        {groups.error && <p className="pc-error">{groups.error}</p>}
        <Button
          disabled={
            locked ||
            !domain.trim() ||
            !selected.length ||
            !groups.data ||
            selected.some((id) => !options.some((g) => g.id === id))
          }
          type="submit"
        >
          Review live rule
        </Button>
      </form>
      <TextField
        id="live-rule-search"
        label="Filter existing rules"
        value={filter}
        onChange={setFilter}
      />
      <DataState error={error} loaded={!!data}>
        <Grid
          headers={['Domain', 'Rule', 'Groups', 'Status', 'Actions']}
          rows={(data?.domains ?? [])
            .filter((r) =>
              r.domain.toLowerCase().includes(filter.toLowerCase()),
            )
            .map((r) => [
              <span>
                {r.domain}
                <small className="sph-sub">{r.comment}</small>
              </span>,
              `${r.type} / ${r.kind}`,
              groupLabel(r.groups),
              r.enabled ? 'Enabled' : 'Disabled',
              <Button
                variant="outline"
                disabled={locked}
                onClick={() =>
                  confirm({
                    title: 'Remove live domain rule?',
                    description: `Delete ${r.type}/${r.kind}: ${r.domain}. Its current groups are ${groupLabel(r.groups)}. Other rules are unchanged. There is no simulator Undo for a live deletion.`,
                    body: {
                      action: 'domain-delete',
                      domain: r.domain,
                      type: r.type,
                      kind: r.kind,
                    },
                  })
                }
              >
                Remove
              </Button>,
            ])}
        />
      </DataState>
    </section>
  );
}
function LocalDns({
  revision,
  locked,
  confirm,
}: {
  revision: number;
  locked: boolean;
  confirm: (p: Pending) => void;
}) {
  const { data, error } = useData<{ hosts: string[] }>('localdns', revision);
  const [ip, setIp] = useState(''),
    [name, setName] = useState('');
  return (
    <section className="panel">
      <h2>Local DNS records</h2>
      <p>
        Give a local IP a hostname. This does not reserve the IP in DHCP or
        rename a device in the router. CNAME records remain in the original
        Pi-hole interface.
      </p>
      <form
        className="sph-actions"
        onSubmit={(e) => {
          e.preventDefault();
          confirm({
            title: 'Add local DNS record?',
            description: `Make ${name} resolve to ${ip} for clients using Pi-hole. Pi-hole may reload DNS configuration.`,
            body: { action: 'local-dns-add', ip, name },
          });
        }}
      >
        <TextField
          id="live-host-name"
          label="Hostname"
          value={name}
          onChange={setName}
          placeholder="printer.home.arpa"
        />
        <TextField
          id="live-host-ip"
          label="IPv4 or IPv6 address"
          value={ip}
          onChange={setIp}
        />
        <Button type="submit" disabled={locked || !ip || !name || !data}>
          Review record
        </Button>
      </form>
      <DataState error={error} loaded={!!data}>
        <Grid
          headers={['Address', 'Hostname(s)', 'Action']}
          rows={(data?.hosts ?? []).map((record) => {
            const [address, ...names] = record.trim().split(/\s+/);
            return [
              address,
              names.join(', '),
              <Button
                variant="outline"
                disabled={locked || names.length !== 1}
                onClick={() =>
                  confirm({
                    title: 'Remove local DNS record?',
                    description: `Remove ${record}. Other records are unchanged. Multi-name records must be managed in the original Pi-hole interface.`,
                    body: {
                      action: 'local-dns-delete',
                      ip: address,
                      name: names[0],
                    },
                  })
                }
              >
                Remove
              </Button>,
            ];
          })}
        />
      </DataState>
    </section>
  );
}
function Inventory({
  kind,
  revision,
}: {
  kind: 'lists' | 'groups' | 'clients';
  revision: number;
}) {
  const { data, error } = useData<{
    lists?: List[];
    groups?: Group[];
    clients?: Client[];
  }>(kind, revision);
  const [filter, setFilter] = useState('');
  const entries = (data?.[kind] ?? []).filter((row) =>
    JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()),
  );
  const rows = entries.map((row) => {
    if (kind === 'lists') {
      const r = row as List;
      return [
        r.address,
        r.type,
        r.enabled ? 'Enabled' : 'Disabled',
        r.groups?.join(', '),
        number(r.number),
        r.comment,
      ];
    }
    if (kind === 'groups') {
      const r = row as Group;
      return [r.id, r.name, r.enabled ? 'Enabled' : 'Disabled', r.comment];
    }
    const r = row as Client;
    return [r.client, r.groups?.join(', '), r.comment];
  });
  return (
    <section className="panel">
      <h2>
        {kind === 'lists'
          ? 'Subscribed blocklists'
          : kind === 'groups'
            ? 'Pi-hole groups'
            : 'Configured client assignments'}
      </h2>
      <p>
        {kind === 'clients'
          ? 'Configured assignments are not the full connected-device inventory. Use Top DNS clients and the query log for observed DNS activity.'
          : 'Read-only view of your existing Pi-hole configuration. Use the original Pi-hole interface to edit these records.'}
      </p>
      <TextField
        id={'live-filter-' + kind}
        label="Filter records"
        value={filter}
        onChange={setFilter}
      />
      <DataState error={error} loaded={!!data}>
        <Grid
          headers={
            kind === 'lists'
              ? ['Address', 'Type', 'State', 'Group IDs', 'Domains', 'Comment']
              : kind === 'groups'
                ? ['ID', 'Name', 'State', 'Comment']
                : ['Client identifier', 'Group IDs', 'Comment']
          }
          rows={rows}
        />
      </DataState>
    </section>
  );
}
export function LivePihole() {
  const [revision, setRevision] = useState(0),
    [tab, setTab] = useState('overview'),
    [queryFocus, setQueryFocus] = useState<QueryFocus>({}),
    [seed, setSeed] = useState({ domain: '', type: 'deny' }),
    [refresh, setRefresh] = useState('5');
  const { data: status, error } = useData<Status>('status', revision);
  const [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [actionError, setActionError] = useState('');
  const locked = !status?.writeEnabled || busy;
  const groups = useData<{ groups: Group[] }>('groups', revision);
  const lists = useData<{ lists: List[] }>('lists', revision);
  useEffect(() => {
    if (
      refresh === 'manual' ||
      tab !== 'overview' ||
      busy ||
      !status?.configured
    )
      return;
    const timer = setInterval(
      () => {
        if (!document.hidden) setRevision((r) => r + 1);
      },
      Number(refresh) * 1000,
    );
    return () => clearInterval(timer);
  }, [refresh, tab, busy, status?.configured]);
  const focus = (filter: QueryFocus) => {
    setQueryFocus(filter);
    setTab('queries');
  };
  return (
    <div className="sph-live">
      <div className="section-head nc-heading">
        <div>
          <p className="eyebrow">SUPER PI HOLE / LIVE DNS</p>
          <h1>
            {status?.configured
              ? 'Your Pi-hole console.'
              : 'Connect your Pi-hole.'}
          </h1>
          <p>
            Original Pi-hole capabilities, with a clearer view of device DNS
            activity.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setRevision((r) => r + 1)}
          disabled={busy}
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>
      <DataState error={error} loaded={!!status}>
        {status && (
          <>
            <div className="nc-review-strip">
              <LockKeyhole />
              <span>
                {status.writeEnabled
                  ? 'Live changes are unlocked. Every action requires confirmation and affects your existing Pi-hole.'
                  : 'Read-only connection. Live changes are locked in the server configuration.'}{' '}
                DNS visibility is not full network monitoring.
              </span>
            </div>
            {status.adminUrl && (
              <p>
                <a
                  className="sph-admin-link"
                  href={status.adminUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original Pi-hole administration{' '}
                  <ExternalLink size={16} />
                </a>{' '}
                {status.controlled ? '— read-only viewer; Super Pi Hole owns live changes.' : '— original settings and diagnostics.'}
              </p>
            )}
            {!status.configured ? (
              <section className="panel">
                <h2>Connect your existing Pi-hole</h2>
                <p>
                  The standalone TrueNAS package accepts PIHOLE_URL and a
                  server-side Pi-hole password. No password is stored in the
                  browser or in exported review settings.
                </p>
                <p>
                  Start with PIHOLE_WRITE_ENABLED=false. Your current Pi-hole
                  keeps running independently.
                </p>
              </section>
            ) : (
              <>
                <output aria-live="polite" className="pc-feedback">
                  {message}
                </output>
                {actionError && (
                  <p role="alert" className="pc-error">
                    {actionError}
                  </p>
                )}
                <Tabs
                  value={tab}
                  onValueChange={(value) => setTab(String(value))}
                >
                  <TabsList className="sph-tabs">
                    {[
                      ['overview', 'Dashboard'],
                      ['queries', 'Query log'],
                      ['domains', 'Domain rules'],
                      ['localdns', 'Local DNS'],
                      ['lists', 'Lists'],
                      ['groups', 'Groups'],
                      ['clients', 'Client assignments'],
                    ].map(([value, label]) => (
                      <TabsTrigger key={value} value={value}>
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value="overview">
                    <div className="sph-actions">
                      <Choice
                        label="Dashboard refresh"
                        value={refresh}
                        onChange={setRefresh}
                        options={[
                          { value: 'manual', label: 'Manual' },
                          { value: '5', label: 'Every 5 seconds' },
                          { value: '30', label: 'Every 30 seconds' },
                          { value: '60', label: 'Every minute' },
                        ]}
                      />
                      <small>
                        Automatic reads pause outside the dashboard and while
                        the browser tab is hidden.
                      </small>
                    </div>
                    <LiveOverview
                      revision={revision}
                      locked={locked}
                      confirm={setPending}
                      focus={focus}
                      showLists={() => setTab('lists')}
                    />
                  </TabsContent>
                  <TabsContent value="queries">
                    <QueryLog
                      key={JSON.stringify(queryFocus)}
                      revision={revision}
                      initial={queryFocus}
                      prepareRule={(domain, type) => {
                        setSeed({ domain, type });
                        setTab('domains');
                      }}
                    />
                  </TabsContent>
                  <TabsContent value="domains">
                    <DomainRules
                      key={seed.domain + seed.type}
                      seed={seed}
                      revision={revision}
                      locked={locked}
                      confirm={setPending}
                    />
                  </TabsContent>
                  <TabsContent value="localdns">
                    <LocalDns
                      revision={revision}
                      locked={locked}
                      confirm={setPending}
                    />
                  </TabsContent>
                  {(['lists', 'groups', 'clients'] as const).map((kind) => (
                    <TabsContent value={kind} key={kind}>
                      <Inventory kind={kind} revision={revision} />
                      {kind === 'lists' && (
                        <>
                          <PrivacyPacks
                            locked={locked || !lists.data || !groups.data}
                            groups={groups.data?.groups}
                            subscribed={lists.data?.lists.map((l) => l.address)}
                            confirm={setPending}
                          />
                          {groups.error && <p role="alert">{groups.error}</p>}
                        </>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </>
            )}
          </>
        )}
      </DataState>
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={locked || !pending}
              onClick={async () => {
                if (!pending || busy) return;
                setBusy(true);
                setActionError('');
                setMessage('');
                try {
                  const result = await liveApi<{ message: string }>(
                    'action',
                    undefined,
                    { ...pending.body, confirmed: true },
                  );
                  setMessage(result.message);
                  setPending(null);
                } catch (e) {
                  setActionError(
                    e instanceof Error ? e.message : 'Live change failed.',
                  );
                  setPending(null);
                } finally {
                  setBusy(false);
                  setRevision((r) => r + 1);
                }
              }}
            >
              {busy ? 'Applying…' : 'Apply to live Pi-hole'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

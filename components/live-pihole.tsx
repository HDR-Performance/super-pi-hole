'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RefreshCw, ExternalLink, LockKeyhole } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Switch } from './ui/switch';
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
import { BlockingControl } from './blocking-control';
import { FilteringManager } from './filtering-manager';
import { HistoryExplorer } from './history-explorer';
import { inspectionUrl } from '@/lib/family-dns.mjs';
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
export async function liveApi<T>(
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
export function useData<T>(path: string, revision: number) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null),
    previousPath = useRef(path);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [path],
  );
  useEffect(() => {
    // Slow reads are allowed to finish instead of being cancelled by each tick.
    if (active.current && !active.current.signal.aborted) return;
    const abort = new AbortController();
    active.current = abort;
    if (previousPath.current !== path) {
      setData(null);
      previousPath.current = path;
    }
    setError('');
    liveApi<T>(path, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (active.current === abort) active.current = null;
      });
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
    <output className="nc-empty">Reading Pi-hole…</output>
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
  refresh,
}: {
  revision: number;
  locked: boolean;
  confirm: (p: Pending) => void;
  focus: (filter: QueryFocus) => void;
  showLists: () => void;
  refresh: () => void;
}) {
  const { data, error } = useData<Overview>('overview', revision);
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
          <BlockingControl
            state={d?.blocking}
            snapshotId={data.fetchedAt}
            locked={locked}
            confirm={confirm}
            refresh={refresh}
          />
          <DnsMetrics data={d ?? {}} focus={focus} showLists={showLists} />
          <DnsVisuals data={d ?? {}} focus={focus} />
          <section className="panel">
            <h2>Top DNS clients</h2>
            <Grid
              headers={['Client', 'Queries', 'Activity']}
              rows={(d?.topClients?.clients ?? []).map((c) => [
                <span key="client">
                  {c.name || c.ip}
                  <small className="sph-sub">{c.ip}</small>
                </span>,
                number(c.count),
                <Button
                  key="queries"
                  variant="outline"
                  onClick={() => focus({ client_ip: c.ip })}
                >
                  View queries
                </Button>,
              ])}
            />
          </section>
          <div className="nc-two">
            {(
              [
                ['Top permitted domains', d?.topDomains?.domains, 'permitted'],
                ['Top blocked domains', d?.topBlocked?.domains, 'blocklist'],
              ] as [
                string,
                { domain: string; count: number }[] | undefined,
                string,
              ][]
            ).map(([title, entries, upstream]) => (
              <section className="panel" key={title}>
                <h2>{title}</h2>
                <Grid
                  headers={['Domain', 'Queries']}
                  rows={(
                    (entries ?? []) as { domain: string; count: number }[]
                  ).map((row) => [
                    <button
                      key="domain"
                      className="sph-domain-link"
                      onClick={() =>
                        focus({
                          domain: row.domain,
                          upstream,
                        })
                      }
                    >
                      {row.domain} ↗
                    </button>,
                    <span key="rank" className="sph-rank">
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
export function QueryLog({
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
    [disk, setDisk] = useState(initial.disk ?? 'false'),
    [advanced, setAdvanced] = useState({
      client_name: initial.client_name ?? '',
      status: initial.status ?? '',
      reply: initial.reply ?? '',
      dnssec: initial.dnssec ?? '',
    }),
    [validation, setValidation] = useState(''),
    [range, setRange] = useState({ from: initial.from, until: initial.until }),
    [query, setQuery] = useState(new URLSearchParams(initial).toString()),
    [cursor, setCursor] = useState('');
  const [follow, setFollow] = useState(false),
    [queryTick, setQueryTick] = useState(0);
  const followAvailable =
    !cursor && new URLSearchParams(query).get('disk') !== 'true';
  useEffect(() => {
    if (!follow || !followAvailable) return;
    const timer = setInterval(() => {
      if (!document.hidden) setQueryTick((n) => n + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, [follow, followAvailable]);
  const request = new URLSearchParams(query);
  const localDate = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(Number(timestamp) * 1000);
    return Number.isFinite(date.getTime())
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 23)
      : '';
  };
  const epoch = (date: string) =>
    date && Number.isFinite(new Date(date).getTime())
      ? String(new Date(date).getTime() / 1000)
      : undefined;
  if (cursor) request.set('cursor', cursor);
  const { data, error } = useData<{
    queries: Query[];
    cursor: number | null;
    fetchedAt: string;
  }>('queries?' + request, revision + queryTick);
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
            Selected interval:{' '}
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
          setValidation('');
          if (
            range.from &&
            range.until &&
            Number(range.from) > Number(range.until)
          ) {
            setValidation('The start must be before the end.');
            return;
          }
          setCursor('');
          const p = new URLSearchParams();
          p.set('disk', disk);
          for (const [key, value] of Object.entries(advanced))
            if (value.trim()) p.set(key, value.trim());
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
          label="History source"
          value={disk}
          onChange={setDisk}
          options={[
            { value: 'false', label: 'Recent / in-memory queries' },
            { value: 'true', label: 'Stored history database' },
          ]}
        />
        <TextField
          id="history-from"
          label="From (your local time)"
          type="datetime-local"
          value={localDate(range.from)}
          onChange={(v) => setRange((r) => ({ ...r, from: epoch(v) }))}
        />
        <TextField
          id="history-until"
          label="Until (your local time)"
          type="datetime-local"
          value={localDate(range.until)}
          onChange={(v) => setRange((r) => ({ ...r, until: epoch(v) }))}
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
        <details className="sph-query-advanced">
          <summary>More filters</summary>
          <div className="sph-actions">
            {Object.entries({
              client_name: 'Client hostname',
              status: 'Query status (e.g. GRAVITY)',
              reply: 'Reply type (e.g. NXDOMAIN)',
              dnssec: 'DNSSEC status (e.g. SECURE)',
            }).map(([key, label]) => (
              <TextField
                key={key}
                id={'query-' + key}
                label={label}
                value={advanced[key as keyof typeof advanced]}
                onChange={(v) => setAdvanced((a) => ({ ...a, [key]: v }))}
              />
            ))}
          </div>
        </details>
        <Button type="submit">Apply filters</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDomain('');
            setClient(initial.client_ip ?? '');
            setResult('all');
            setType('');
            setDisk('false');
            setAdvanced({ client_name: '', status: '', reply: '', dnssec: '' });
            setValidation('');
            setRange({ from: undefined, until: undefined });
            setCursor('');
            setQuery(
              new URLSearchParams(
                initial.client_ip ? { client_ip: initial.client_ip } : {},
              ).toString(),
            );
          }}
        >
          Clear filters
        </Button>
      </form>
      {validation && (
        <p role="alert" className="pc-error">
          {validation}
        </p>
      )}
      <p>
        Stored history is limited by Pi-hole’s retention and privacy settings.
        Times use this browser’s timezone. Apply filters to load the selected
        source.
      </p>
      <label className="sph-check" htmlFor="follow-queries">
        <Switch
          id="follow-queries"
          checked={follow}
          onCheckedChange={setFollow}
        />
        Follow recent queries every 5 seconds
      </label>
      <small>
        {followAvailable
          ? 'Automatic reads pause while the browser tab is hidden.'
          : 'Following is paused while viewing stored history or older pages.'}
      </small>
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
                new Date(q.time * 1000).toLocaleString(),
                <span key="client">
                  {q.client?.name || q.client?.ip}
                  <small className="sph-sub">{q.client?.ip}</small>
                </span>,
                <span key="domain">
                  {q.domain}
                  <small className="sph-sub">{q.type}</small>
                  {inspectionUrl(q.domain) && <a href={inspectionUrl(q.domain)!} target="_blank" rel="noopener noreferrer" onClick={e => { if (!window.confirm(`Open https://${q.domain}/ for manual inspection? This contacts the site and it may be unsafe. A DNS query is not proof someone visited it.`)) e.preventDefault(); }}>Inspect site ↗</a>}
                </span>,
                <span key="status">
                  {q.status ?? 'Unknown'}
                  <small className="sph-sub">{q.reply?.type}</small>
                </span>,
                <div key="actions" className="sph-actions">
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
    [editing, setEditing] = useState<Rule | null>(null),
    [enabled, setEnabled] = useState(true),
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
            title: `${editing ? 'Update' : 'Add'} live ${type === 'allow' ? 'allow' : 'block'} rule?`,
            description: `${kind} rule: ${domain}. Applies to Pi-hole groups: ${groupLabel(selected)}. It is not automatically limited to the device you selected in the query log.`,
            body: {
              action: editing ? 'domain-edit' : 'domain-add',
              domain,
              type: editing?.type ?? type,
              nextType: type,
              kind,
              comment,
              groups: selected,
              enabled,
              expected: editing,
            },
          });
        }}
      >
        <div className="sph-actions">
          {!editing ? (
            <TextField
              id="live-rule-domain"
              label="Domain or POSIX regular expression"
              value={domain}
              onChange={setDomain}
            />
          ) : (
            <p>
              <strong>Editing {editing.domain}</strong>
              <small className="sph-sub">
                The hostname and match kind stay unchanged.
              </small>
            </p>
          )}
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
            disabled={!!editing}
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
        {editing && (
          <label className="sph-check" htmlFor="rule-enabled">
            <Switch
              id="rule-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            Rule enabled
          </label>
        )}
        <fieldset className="sph-groups">
          <legend>Existing Pi-hole groups</legend>
          {options.map((g) => (
            <label key={g.id} htmlFor={'domain-group-' + g.id}>
              <Checkbox
                id={'domain-group-' + g.id}
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
            (!editing && !selected.length) ||
            !groups.data ||
            selected.some((id) => !options.some((g) => g.id === id))
          }
          type="submit"
        >
          Review live rule
        </Button>
        {editing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setDomain('');
              setType('deny');
              setKind('exact');
              setComment('');
              setSelected([0]);
              setEnabled(true);
            }}
          >
            Finish editing / new rule
          </Button>
        )}
        {editing && !selected.length && (
          <p>This rule has no groups and will not apply to clients.</p>
        )}
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
              <span key="domain">
                {r.domain}
                <small className="sph-sub">{r.comment}</small>
              </span>,
              `${r.type} / ${r.kind}`,
              groupLabel(r.groups),
              r.enabled ? 'Enabled' : 'Disabled',
              <div key="actions" className="sph-actions">
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => {
                    setEditing(r);
                    setDomain(r.domain);
                    setKind(r.kind);
                    setType(r.type);
                    setComment(r.comment ?? '');
                    setSelected(r.groups);
                    setEnabled(r.enabled);
                  }}
                >
                  Edit
                </Button>
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
                </Button>
              </div>,
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
        rename a device in the router. CNAME aliases are available in Settings &
        diagnostics under Everyday controls.
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
                key="remove"
                variant="outline"
                disabled={locked || names.length !== 1}
                onClick={() =>
                  confirm({
                    title: 'Remove local DNS record?',
                    description: `Remove ${record}. Other records are unchanged. Multi-name records can be managed under Settings & tools → Local host records.`,
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
export function LivePihole() {
  const [mutationRevision, setMutationRevision] = useState(0);
  const [revision, setRevision] = useState(0),
    [tab, setTab] = useState('overview'),
    [queryFocus, setQueryFocus] = useState<QueryFocus>({}),
    [seed, setSeed] = useState({ domain: '', type: 'deny' }),
    [refresh, setRefresh] = useState('5');
  const refreshNow = useCallback(() => setRevision((r) => r + 1), []);
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
                {status.controlled
                  ? '— read-only viewer; Super Pi Hole owns live changes.'
                  : '— original settings and diagnostics.'}
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
                      ['history', 'Long-term history'],
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
                      refresh={refreshNow}
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
                  <TabsContent value="history">
                    <HistoryExplorer revision={revision} focus={focus} />
                  </TabsContent>
                  <TabsContent value="domains">
                    <DomainRules
                      key={seed.domain + seed.type + mutationRevision}
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
                      <FilteringManager
                        key={kind + mutationRevision}
                        kind={kind}
                        revision={revision}
                        locked={locked}
                        confirm={setPending}
                      />
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
                  setMutationRevision((r) => r + 1);
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

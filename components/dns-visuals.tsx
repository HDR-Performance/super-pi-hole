'use client';
import { useState } from 'react';
import {
  Activity,
  ShieldCheck,
  PieChart as PieIcon,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  PieChart,
  Pie,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';
import { Button } from './ui/button';
import { Choice, Empty } from './review-context';
import {
  timeline,
  clientTimeline,
  queryWindow,
  type HistorySample,
  type ClientHistory,
  type QueryFocus,
} from '@/lib/dns-charts';

export type DashboardData = {
  summary?: {
    queries?: { total: number; blocked: number; percent_blocked: number };
    clients?: { active: number };
    gravity?: { domains_being_blocked: number };
  };
  history?: { history: HistorySample[] };
  clientHistory?: ClientHistory;
  queryTypes?: { types: Record<string, number> };
  upstreams?: {
    upstreams: {
      ip: string | null;
      name: string | null;
      port?: number;
      count: number;
      statistics?: { response: number };
    }[];
  };
};
const colors = [
  '#37c4ae',
  '#7897ff',
  '#f1a368',
  '#d184d8',
  '#78bfd6',
  '#c8c57c',
  '#bca7fb',
  '#ef8296',
  '#8b9aa9',
];
const format = (v: number | undefined) =>
  typeof v === 'number' && Number.isFinite(v)
    ? v.toLocaleString()
    : 'Unavailable';
const time = (v: number) =>
  new Date(v * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
const stamp = (v: unknown) => new Date(Number(v) * 1000).toLocaleString();
const series = {
  forwarded: { label: 'Forwarded', color: colors[1] },
  cached: { label: 'Cached', color: colors[0] },
  blocked: { label: 'Blocked', color: colors[2] },
  other: { label: 'Other results', color: colors[8] },
};

export function DnsMetrics({
  data,
  focus,
  showLists,
}: {
  data: DashboardData;
  focus: (f: QueryFocus) => void;
  showLists: () => void;
}) {
  const cards = [
    {
      title: 'Total DNS queries',
      value: format(data.summary?.queries?.total),
      detail: `${format(data.summary?.clients?.active)} active DNS clients`,
      icon: Activity,
      action: () => focus({}),
    },
    {
      title: 'Queries blocked',
      value: format(data.summary?.queries?.blocked),
      detail: 'Inspect blocked requests',
      icon: ShieldCheck,
      action: () => focus({ upstream: 'blocklist' }),
    },
    {
      title: 'Percentage blocked',
      value: data.summary?.queries
        ? data.summary.queries.percent_blocked.toFixed(1) + '%'
        : 'Unavailable',
      detail: 'Share of DNS requests, not a safety score',
      icon: PieIcon,
      action: () => focus({ upstream: 'blocklist' }),
    },
    {
      title: 'Domains on lists',
      value: format(data.summary?.gravity?.domains_being_blocked),
      detail: 'Inspect Pi-hole subscriptions',
      icon: Layers,
      action: showLists,
    },
  ];
  return (
    <div className="sph-metrics">
      {cards.map((card, i) => (
        <button
          key={card.title}
          className={`sph-metric sph-metric-${i}`}
          onClick={card.action}
        >
          <span className="sph-metric-label">
            {card.title}
            <card.icon size={23} />
          </span>
          <strong>{card.value}</strong>
          <span className="sph-metric-detail">
            {card.detail}
            <ArrowUpRight size={17} />
          </span>
        </button>
      ))}
    </div>
  );
}

function Breakdown({
  title,
  note,
  rows,
  focus,
}: {
  title: string;
  note: string;
  rows: { name: string; value: number; filter?: QueryFocus }[] | undefined;
  focus: (f: QueryFocus) => void;
}) {
  const valid =
    rows?.filter((r) => Number.isFinite(r.value) && r.value > 0) ?? [];
  const total = valid.reduce((sum, row) => sum + row.value, 0);
  return (
    <section className="panel sph-chart-panel">
      <div>
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
      {!rows ? (
        <Empty>Unavailable from this Pi-hole response.</Empty>
      ) : !total ? (
        <Empty>No query counts returned for this breakdown.</Empty>
      ) : (
        <div className="sph-donut-layout">
          <div className="sph-donut">
            <ChartContainer
              config={{ value: { label: 'Queries' } }}
              className="sph-donut-chart"
            >
              <PieChart accessibilityLayer>
                <Pie
                  data={valid.map((row, i) => ({
                    ...row,
                    fill: colors[i % colors.length],
                  }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="65%"
                  outerRadius="88%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              </PieChart>
            </ChartContainer>
            <div className="sph-donut-center">
              <strong>{format(total)}</strong>
              <span>DNS requests</span>
            </div>
          </div>
          <ul className="sph-chart-key">
            {valid.map((row, i) => (
              <li key={row.name}>
                <button
                  disabled={!row.filter}
                  onClick={() => row.filter && focus(row.filter)}
                  aria-label={`View ${row.name} queries`}
                >
                  <span
                    className="sph-dot"
                    style={{ background: colors[i % colors.length] }}
                  />
                  <span>{row.name}</span>
                  <strong>{format(row.value)}</strong>
                  <small>{((row.value / total) * 100).toFixed(1)}%</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function DnsVisuals({
  data,
  focus,
  rangeHours,
}: {
  data: DashboardData;
  focus: (f: QueryFocus) => void;
  rangeHours?: number;
}) {
  const [hours, setHours] = useState('24'),
    [hidden, setHidden] = useState<string[]>([]);
  const traffic = timeline(
    data.history?.history ?? [],
    rangeHours ?? Number(hours),
  );
  const devices = clientTimeline(
    data.clientHistory ?? { clients: {}, history: [] },
    rangeHours ?? Number(hours),
  );
  const toggle = (key: string) =>
    setHidden((old) =>
      old.includes(key) ? old.filter((k) => k !== key) : [...old, key],
    );
  const clientConfig = Object.fromEntries(
    devices.clients.map((c, i) => [
      c.key,
      { label: c.name, color: colors[i % colors.length] },
    ]),
  );
  const drill = (state: unknown) => {
    const value = (state as { activeLabel?: string | number })?.activeLabel;
    if (
      value !== undefined &&
      traffic.rows.some((r) => r.timestamp === Number(value))
    )
      focus(queryWindow(traffic.rows, Number(value)));
  };
  return (
    <>
      <section className="panel sph-chart-panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">DNS PULSE</span>
            <h2>Queries over time</h2>
            <p>Every request, grouped by the response Pi-hole recorded.</p>
          </div>
          {rangeHours === undefined ? (
            <Choice
              label="Chart window"
              value={hours}
              onChange={setHours}
              options={[
                { value: '1', label: 'Last hour' },
                { value: '6', label: 'Last 6 hours' },
                { value: '24', label: 'Last 24 hours' },
              ]}
            />
          ) : (
            <small>Full selected database interval</small>
          )}
        </div>
        <div className="sph-legend">
          {Object.entries(series).map(([key, item]) => (
            <button
              key={key}
              aria-pressed={!hidden.includes(key)}
              onClick={() => toggle(key)}
            >
              <span className="sph-dot" style={{ background: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
        {!data.history ? (
          <Empty>
            Query history unavailable. Check the connection and Pi-hole privacy
            settings.
          </Empty>
        ) : !traffic.rows.length ? (
          <Empty>No usable history samples returned.</Empty>
        ) : (
          <>
            <ChartContainer config={series} className="sph-timeline">
              <BarChart
                accessibilityLayer
                data={traffic.rows}
                onClick={drill}
                barCategoryGap="12%"
                margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 5" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={time}
                  minTickGap={45}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  width={48}
                  tickFormatter={(v) =>
                    Number(v) >= 1000 ? `${Number(v) / 1000}k` : String(v)
                  }
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={stamp} />}
                />
                {Object.entries(series).map(([key, item]) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={item.label}
                    stackId="queries"
                    fill={item.color}
                    hide={hidden.includes(key)}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <p className="nc-helper">
              {stamp(traffic.rows[0].timestamp)} –{' '}
              {stamp(traffic.rows.at(-1)!.timestamp)} · Browser local time;
              labels mark bucket centers. Click a bar or use the sample table to
              inspect that interval. The window filters returned history, not
              the summary totals.
            </p>
            <details className="sph-chart-data">
              <summary>Query samples & keyboard-accessible drill-down</summary>
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Total</th>
                      <th>Forwarded</th>
                      <th>Cached</th>
                      <th>Blocked</th>
                      <th>Other</th>
                      <th>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traffic.rows.map((row) => (
                      <tr key={row.timestamp}>
                        <td>{stamp(row.timestamp)}</td>
                        <td>{format(row.total)}</td>
                        <td>{format(row.forwarded)}</td>
                        <td>{format(row.cached)}</td>
                        <td>{format(row.blocked)}</td>
                        <td>{format(row.other)}</td>
                        <td>
                          <Button
                            variant="outline"
                            onClick={() =>
                              focus(queryWindow(traffic.rows, row.timestamp))
                            }
                          >
                            View interval
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
        {traffic.omitted > 0 && (
          <output>
            {traffic.omitted} inconsistent samples omitted; missing counts were
            not replaced with zero.
          </output>
        )}
      </section>
      <section className="panel sph-chart-panel">
        <div>
          <span className="eyebrow">DEVICE RHYTHM</span>
          <h2>Client activity</h2>
          <p>
            {rangeHours === undefined
              ? 'Top eight DNS clients and the remaining clients.'
              : 'Clients returned for the selected database interval.'}{' '}
            This is request volume, not bandwidth or time spent online.
          </p>
        </div>
        {!data.clientHistory ? (
          <Empty>
            Client history unavailable. Pi-hole privacy settings may hide device
            identity.
          </Empty>
        ) : !devices.rows.length || !devices.clients.length ? (
          <Empty>No client-history samples returned.</Empty>
        ) : (
          <>
            <ChartContainer config={clientConfig} className="sph-timeline">
              <BarChart
                accessibilityLayer
                data={devices.rows}
                barCategoryGap="10%"
              >
                <CartesianGrid vertical={false} strokeDasharray="3 5" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={time}
                  minTickGap={45}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis width={48} tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={stamp} />}
                />
                {devices.clients.map((client, i) => (
                  <Bar
                    key={client.key}
                    dataKey={client.key}
                    name={client.name}
                    stackId="clients"
                    fill={colors[i % colors.length]}
                    hide={hidden.includes(client.key)}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <ul className="sph-client-key">
              {devices.clients.map((client, i) => (
                <li key={client.ip}>
                  <button
                    aria-pressed={!hidden.includes(client.key)}
                    onClick={() => toggle(client.key)}
                  >
                    <span
                      className="sph-dot"
                      style={{ background: colors[i % colors.length] }}
                    />
                    {client.name}
                    <small>
                      {client.ip === '0.0.0.0' ? 'Aggregate' : client.ip}
                    </small>
                  </button>
                  {client.ip !== '0.0.0.0' && (
                    <Button
                      variant="ghost"
                      onClick={() => focus({ client_ip: client.ip })}
                      aria-label={`View queries for ${client.name}`}
                    >
                      Queries <ArrowUpRight size={15} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {devices.omitted > 0 && (
          <output>{devices.omitted} invalid client samples omitted.</output>
        )}
      </section>
      <div className="nc-two">
        <Breakdown
          title="Query types"
          note="Which DNS record types your devices request. Select a legend row to inspect."
          rows={
            data.queryTypes
              ? Object.entries(data.queryTypes.types).map(([name, value]) => ({
                  name,
                  value,
                  filter: { type: name },
                }))
              : undefined
          }
          focus={focus}
        />
        <Breakdown
          title="Where queries are answered"
          note="Resolvers, local cache and blocking results—not destination countries."
          rows={data.upstreams?.upstreams.map((u) => ({
            name: u.name || u.ip || 'Unknown result',
            value: u.count,
            filter: ['cache', 'blocklist'].includes(u.name ?? '')
              ? { upstream: u.name! }
              : u.ip && u.port && u.port > 0
                ? { upstream: `${u.ip}#${u.port}` }
                : undefined,
          }))}
          focus={focus}
        />
      </div>
    </>
  );
}

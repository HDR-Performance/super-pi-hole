'use client';
import { useState } from 'react';
import { Button } from './ui/button';
import { TextField } from './review-context';
import { useData } from './live-pihole';
import { DnsVisuals, type DashboardData } from './dns-visuals';
import type { QueryFocus } from '@/lib/dns-charts';
type HistoryData = Omit<DashboardData, 'summary'> & {
  summary?: {
    sum_queries: number;
    sum_blocked: number;
    percent_blocked: number;
    total_clients: number;
  };
  topDomains?: { domains: { domain: string; count: number }[] };
  topBlocked?: { domains: { domain: string; count: number }[] };
  topClients?: {
    clients: { ip: string; name: string | null; count: number }[];
  };
};
export function HistoryExplorer({
  revision,
  focus,
}: {
  revision: number;
  focus: (f: QueryFocus) => void;
}) {
  const [from, setFrom] = useState(''),
    [until, setUntil] = useState(''),
    [range, setRange] = useState<{ from: string; until: string } | null>(null),
    [error, setError] = useState('');
  const response = useData<{
    data: HistoryData;
    errors: Record<string, string>;
    fetchedAt: string;
  }>(range ? 'historical?' + new URLSearchParams(range) : 'version', revision);
  const local = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  const open = (filters: QueryFocus) =>
    focus({ ...range, ...filters, disk: 'true' });
  const data = range ? response.data?.data : undefined;
  const count = (n?: number) =>
    typeof n === 'number' && Number.isFinite(n)
      ? n.toLocaleString()
      : 'Unavailable';
  return (
    <div className="sph-history">
      <section className="panel">
        <h2>Long-term DNS history</h2>
        <p>
          Read the engine’s stored database. Retention and privacy settings
          limit what is available. This is DNS activity, not browsing duration
          or complete website history.
        </p>
        <form
          className="sph-actions"
          onSubmit={(e) => {
            e.preventDefault();
            const start = Math.floor(new Date(from).getTime() / 1000),
              end = Math.floor(new Date(until).getTime() / 1000);
            if (
              !Number.isFinite(start) ||
              !Number.isFinite(end) ||
              start < 0 ||
              start >= end ||
              end - start > 366 * 86400
            ) {
              setError('Choose a valid forward interval of at most 366 days.');
              return;
            }
            setError('');
            setRange({ from: String(start), until: String(end) });
          }}
        >
          <TextField
            id="stats-from"
            label="From (local time)"
            type="datetime-local"
            value={from}
            onChange={setFrom}
          />
          <TextField
            id="stats-until"
            label="Until (local time)"
            type="datetime-local"
            value={until}
            onChange={setUntil}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const end = new Date();
              setFrom(local(new Date(end.getTime() - 7 * 86400000)));
              setUntil(local(end));
            }}
          >
            Choose last 7 days
          </Button>
          <Button disabled={!from || !until}>Load stored statistics</Button>
        </form>
        {(error || response.error) && (
          <p role="alert" className="pc-error">
            {error || response.error}
          </p>
        )}
        {range && (
          <p>
            Loaded selection:{' '}
            {new Date(Number(range.from) * 1000).toLocaleString()} –{' '}
            {new Date(Number(range.until) * 1000).toLocaleString()}
          </p>
        )}
      </section>
      {data && (
        <>
          {Object.entries(response.data?.errors ?? {}).map(([key, value]) => (
            <p key={key} role="alert" className="pc-error">
              {key}: {value}
            </p>
          ))}
          <section className="panel sph-actions">
            <Button variant="outline" onClick={() => open({})}>
              {count(data.summary?.sum_queries)} queries
            </Button>
            <Button
              variant="outline"
              onClick={() => open({ upstream: 'blocklist' })}
            >
              {count(data.summary?.sum_blocked)} blocked
            </Button>
            <span>
              {count(data.summary?.percent_blocked)}% blocked ·{' '}
              {count(data.summary?.total_clients)} clients
            </span>
          </section>
          <DnsVisuals
            data={{ ...data, summary: undefined }}
            focus={open}
            rangeHours={(Number(range!.until) - Number(range!.from)) / 3600 + 1}
          />
          <div className="sph-setting-grid">
            {(['topDomains', 'topBlocked'] as const).map((key) => (
              <section key={key} className="panel">
                <h2>
                  {key === 'topDomains'
                    ? 'Top permitted domains'
                    : 'Top blocked domains'}
                </h2>
                {data[key]?.domains.map((d) => (
                  <p key={d.domain}>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        open({
                          domain: d.domain,
                          upstream:
                            key === 'topBlocked' ? 'blocklist' : 'permitted',
                        })
                      }
                    >
                      {d.domain} · {count(d.count)}
                    </Button>
                  </p>
                ))}
                {data[key]?.domains.length === 0 && (
                  <p>No domains in this interval.</p>
                )}
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>Top DNS clients</h2>
            {data.topClients?.clients.map((c) => (
              <p key={c.ip}>
                <Button
                  variant="ghost"
                  onClick={() => open({ client_ip: c.ip })}
                >
                  {c.name || c.ip} · {count(c.count)} queries
                </Button>
              </p>
            ))}
            {data.topClients?.clients.length === 0 && (
              <p>No clients in this interval.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

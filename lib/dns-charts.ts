// Only normalize returned DNS counts. Never invent samples or treat requests as visits.
export type HistorySample = {
  timestamp: number;
  total: number;
  cached: number;
  blocked: number;
  forwarded: number;
};
export type ClientHistory = {
  clients: Record<string, { name: string | null; total: number }>;
  history: { timestamp: number; data: Record<string, number> }[];
};
export type QueryFocus = {
  client_ip?: string;
  domain?: string;
  upstream?: string;
  type?: string;
  from?: string;
  until?: string;
};
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function timeline(input: HistorySample[], hours = 24) {
  const valid = input
    .filter(
      (r) =>
        count(r.timestamp) &&
        count(r.total) &&
        count(r.cached) &&
        count(r.blocked) &&
        count(r.forwarded) &&
        r.cached + r.blocked + r.forwarded <= r.total,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const end = valid.at(-1)?.timestamp ?? 0;
  return {
    omitted: input.length - valid.length,
    rows: valid
      .filter((r) => r.timestamp > end - hours * 3600)
      .map((r) => ({
        ...r,
        other: r.total - r.cached - r.blocked - r.forwarded,
      })),
  };
}
export function clientTimeline(input: ClientHistory, hours = 24) {
  // Neutral data keys keep dotted IPv4 addresses out of chart path expressions.
  const clients = Object.entries(input.clients)
    .slice(0, 9)
    .map(([ip, client], i) => ({
      ip,
      key: 'client' + i,
      name: client.name || ip,
      total: client.total,
    }));
  const valid = input.history
    .filter(
      (r) =>
        count(r.timestamp) &&
        r.data &&
        clients.every((c) => r.data[c.ip] === undefined || count(r.data[c.ip])),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const end = valid.at(-1)?.timestamp ?? 0;
  const rows = valid
    .filter((r) => r.timestamp > end - hours * 3600)
    .map((r) => ({
      timestamp: r.timestamp,
      ...Object.fromEntries(clients.map((c) => [c.key, r.data[c.ip] ?? 0])),
    }));
  return { clients, rows, omitted: input.history.length - valid.length };
}
export function queryWindow(
  samples: { timestamp: number }[],
  timestamp: number,
): QueryFocus {
  const times = [...new Set(samples.map(r => r.timestamp))].sort((a, b) => a - b);
  const gaps = times.slice(1).map((value, i) => value - times[i]).filter(value => value > 0);
  // FTL history timestamps are bucket CENTERS (src/overTime.c), not starts.
  // Its v6 in-memory interval is 600s; prefer measured spacing when available.
  const half = (gaps.length ? Math.min(...gaps) : 600) / 2;
  return {
    from: String(Math.max(0, timestamp - half)),
    until: String(timestamp + half - 0.001),
  };
}

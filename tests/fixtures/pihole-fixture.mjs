// Synthetic RFC 5737 / .example data only. Never calls an actual Pi-hole.
export function fixtureFetch() {
  const calls = [];
  let blocking = 'disabled',
    timer = null;
  const domains = [
    {
      id: 1,
      domain: 'telemetry.example',
      type: 'deny',
      kind: 'exact',
      enabled: true,
      groups: [0],
      comment: 'Synthetic test fixture',
    },
  ];
  const hosts = ['192.0.2.20 printer.home.arpa'];
  const lists = [
    {
      id: 1,
      address: 'https://lists.example/balanced.txt',
      type: 'block',
      enabled: true,
      groups: [0],
      number: 12345,
      comment: 'Synthetic list',
    },
  ];
  const now = Math.floor(Date.now() / 1800000) * 1800;
  const weights = Array.from(
    { length: 48 },
    (_, i) => 2 + (i % 13 === 0 ? 12 : i % 7),
  );
  const allocate = (total, w) => {
    const sum = w.reduce((a, b) => a + b, 0),
      result = w.map((n) => Math.floor((n / sum) * total));
    let left = total - result.reduce((a, b) => a + b, 0);
    for (let i = 0; left > 0; i = (i + 1) % result.length, left--) result[i]++;
    return result;
  };
  const totals = allocate(250, weights),
    blocks = allocate(40, totals),
    cache = allocate(60, totals);
  const history = totals.map((total, i) => ({
    timestamp: now - (47 - i) * 1800,
    total,
    blocked: blocks[i],
    cached: cache[i],
    forwarded: total - blocks[i] - cache[i],
  }));
  const request = async (url, init = {}) => {
    const u = new URL(url),
      method = init.method ?? 'GET',
      body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({
      path: u.pathname,
      query: u.searchParams.toString(),
      method,
      body,
      headers: init.headers,
    });
    const response = (value) =>
      new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
      });
    if (u.pathname === '/api/auth')
      return response({
        session: { valid: true, sid: 'fixture-session', validity: 300 },
      });
    if (u.pathname === '/api/dns/blocking') {
      if (method === 'POST') {
        blocking = body.blocking ? 'enabled' : 'disabled';
        timer = body.timer;
      }
      return response({ blocking, timer });
    }
    if (u.pathname === '/api/stats/summary')
      return response({
        queries: { total: 250, blocked: 40, percent_blocked: 16 },
        clients: { active: 2 },
        gravity: { domains_being_blocked: 12345 },
      });
    if (u.pathname === '/api/stats/top_clients')
      return response({
        clients: [{ ip: '192.0.2.20', name: 'Test printer', count: 200 }],
      });
    if (u.pathname === '/api/stats/top_domains')
      return response({
        domains:
          u.searchParams.get('blocked') === 'true'
            ? [{ domain: 'telemetry.example', count: 40 }]
            : [
                { domain: 'updates.example', count: 150 },
                { domain: 'stream.example', count: 60 },
              ],
      });
    if (u.pathname === '/api/stats/upstreams')
      return response({
        upstreams: [
          {
            ip: '192.0.2.53',
            port: 53,
            name: 'Example resolver',
            count: 150,
            statistics: { response: 0.015 },
          },
          { ip: null, name: 'cache', port: -1, count: 60 },
          { ip: null, name: 'blocklist', port: -1, count: 40 },
        ],
      });
    if (u.pathname === '/api/stats/query_types')
      return response({ types: { A: 180, AAAA: 50, HTTPS: 20, TXT: 0 } });
    if (u.pathname === '/api/history') return response({ history });
    if (u.pathname === '/api/history/clients')
      return response({
        clients: {
          '192.0.2.20': { name: 'Test printer', total: 200 },
          '192.0.2.21': { name: 'Test TV', total: 50 },
          '0.0.0.0': { name: 'other clients', total: 0 },
        },
        history: history.map((h, i) => ({
          timestamp: h.timestamp,
          data: {
            '192.0.2.20': h.total - (i < 2 ? 2 : 1),
            '192.0.2.21': i < 2 ? 2 : 1,
            '0.0.0.0': 0,
          },
        })),
      });
    if (u.pathname === '/api/queries') {
      const all = [
        {
          id: 200,
          time: now + 10,
          domain: 'updates.example',
          type: 'A',
          status: 'FORWARDED',
          client: { ip: '192.0.2.20', name: 'Test printer' },
          reply: { type: 'IP', time: 15 },
        },
        {
          id: 199,
          time: now + 5,
          domain: 'telemetry.example',
          type: 'AAAA',
          status: 'GRAVITY',
          client: { ip: '192.0.2.20', name: 'Test printer' },
          reply: { type: 'IP', time: 0.1 },
        },
      ];
      let queries = u.searchParams.has('cursor') ? [] : all;
      if (u.searchParams.get('domain'))
        queries = queries.filter(
          (q) => q.domain === u.searchParams.get('domain'),
        );
      if (u.searchParams.get('upstream') === 'blocklist')
        queries = queries.filter((q) => q.status === 'GRAVITY');
      if (
        u.searchParams.get('upstream') === 'permitted' ||
        u.searchParams.get('upstream') === '192.0.2.53#53'
      )
        queries = queries.filter((q) => q.status === 'FORWARDED');
      if (u.searchParams.get('upstream') === 'cache') queries = [];
      if (u.searchParams.get('type'))
        queries = queries.filter((q) => q.type === u.searchParams.get('type'));
      if (u.searchParams.get('client_ip'))
        queries = queries.filter(
          (q) => q.client.ip === u.searchParams.get('client_ip'),
        );
      if (u.searchParams.get('from'))
        queries = queries.filter(
          (q) => q.time >= Number(u.searchParams.get('from')),
        );
      if (u.searchParams.get('until'))
        queries = queries.filter(
          (q) => q.time <= Number(u.searchParams.get('until')),
        );
      return response({
        queries,
        cursor: queries.length ? 198 : null,
        recordsTotal: all.length,
      });
    }
    if (u.pathname === '/api/domains') return response({ domains });
    if (u.pathname.startsWith('/api/domains/')) {
      const [, , , type, kind, encoded] = u.pathname.split('/');
      if (method === 'POST')
        domains.push({ ...body, id: domains.length + 10, type, kind });
      if (method === 'DELETE') {
        const index = domains.findIndex(
          (r) =>
            r.type === type &&
            r.kind === kind &&
            r.domain === decodeURIComponent(encoded),
        );
        if (index >= 0) domains.splice(index, 1);
      }
      return response({
        domains,
        processed: { success: [{ item: body?.domain }], errors: [] },
      });
    }
    if (u.pathname === '/api/config/dns/hosts')
      return response({ config: { dns: { hosts } } });
    if (u.pathname.startsWith('/api/config/dns/hosts/')) {
      const value = decodeURIComponent(
        u.pathname.slice('/api/config/dns/hosts/'.length),
      );
      if (method === 'PUT' && !hosts.includes(value)) hosts.push(value);
      if (method === 'DELETE') {
        const index = hosts.indexOf(value);
        if (index >= 0) hosts.splice(index, 1);
      }
      return new Response(null, { status: method === 'PUT' ? 201 : 204 });
    }
    if (u.pathname === '/api/groups')
      return response({
        groups: [
          { id: 0, name: 'Default', enabled: true, comment: 'Synthetic group' },
          { id: 1, name: 'IoT', enabled: true, comment: 'Synthetic group' },
        ],
      });
    if (u.pathname === '/api/clients')
      return response({
        clients: [
          { id: 1, client: '192.0.2.20', groups: [1], comment: 'Test printer' },
        ],
      });
    if (u.pathname === '/api/lists') {
      if (method === 'POST')
        lists.push({ ...body, id: lists.length + 1, type: 'block', number: 0 });
      return response({ lists });
    }
    if (u.pathname === '/api/info/version')
      return response({ version: { ftl: { local: { version: 'v6.6' } } } });
    return new Response(
      JSON.stringify({
        error: { message: 'Fixture endpoint not implemented' },
      }),
      { status: 404 },
    );
  };
  return { request, calls };
}

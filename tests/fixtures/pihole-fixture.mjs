// Synthetic RFC 5737 / .example data only. Never calls an actual Pi-hole.
export function fixtureFetch({ clock = Date.now } = {}) {
  const calls = [];
  let blocking = 'disabled',
    timer = null, expiresAt = null, timerTarget = true;
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
  const clients = [{ id: 1, client: '192.0.2.20', groups: [1], comment: 'Test printer' }];
  const groups = [{ id: 0, name: 'Default', enabled: true, comment: 'Synthetic group' }, { id: 1, name: 'IoT', enabled: true, comment: 'Synthetic group' }];
  const config = { dns: { upstreams: ['192.0.2.53'], hosts, port: 53, listeningMode: 'LOCAL', dnssec: false, queryLogging: true, cnameRecords: [], revServers: [], cache: { size: 10000 }, domainNeeded: true, bogusPriv: true }, dhcp: { active: false, start: '192.0.2.50', end: '192.0.2.200', router: '192.0.2.1', netmask: '255.255.255.0', leaseTime: '24h', hosts: [] }, ntp: { sync: { active: false } }, resolver: { resolveIPv4: true }, database: { maxDBdays: 91 }, misc: { privacylevel: 0 } };
  const detailed = (value, prefix = '') => Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) return [key, detailed(item, path)];
    return [key, { value: item, default: item, type: Array.isArray(item) ? 'array' : typeof item === 'number' ? 'unsigned integer' : typeof item, description: `Synthetic setting for ${path}. Production descriptions come directly from FTL.`, allowed: path === 'misc.privacylevel' ? [0, 1, 2, 3].map((item, i) => ({ item, description: ['Show all', 'Hide domains', 'Hide domains and clients', 'Anonymous mode'][i] })) : null, flags: { env_var: path === 'dns.listeningMode', restart_dnsmasq: path.startsWith('dhcp.') } }];
  }));
  const merge = (target, patch) => { for (const [key, value] of Object.entries(patch)) { if (value && typeof value === 'object' && !Array.isArray(value)) merge(target[key] ??= {}, value); else target[key] = value; } };
  const leases = [{ ip: '192.0.2.51', name: 'Test tablet', hwaddr: '02:00:00:00:00:51', expires: 1893456000, clientid: '*' }];
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
    if (u.pathname === '/api/stats/database/summary') return response({ sum_queries: 250, sum_blocked: 40, percent_blocked: 16, total_clients: 2 });
    if (u.pathname.startsWith('/api/stats/database/')) u.pathname = u.pathname.replace('/stats/database/', '/stats/');
    if (u.pathname.startsWith('/api/history/database')) u.pathname = u.pathname.replace('/history/database', '/history');
    if (u.pathname === '/api/network/devices') return response({ devices: [{ id: 1, hwaddr: '02:00:00:00:00:20', interface: 'fixture0', firstSeen: now - 86400, lastQuery: now, numQueries: 200, macVendor: 'Synthetic printer', ips: [{ ip: '192.0.2.20', name: 'Test printer', lastSeen: now }] }] });
    if (u.pathname === '/api/config') { if (method === 'PATCH') merge(config, body.config); return response({ config: u.searchParams.get('detailed') === 'true' ? detailed(config) : config }); }
    if (u.pathname === '/api/dhcp/leases') return response({ leases });
    if (u.pathname.startsWith('/api/dhcp/leases/') && method === 'DELETE') { const index = leases.findIndex(l => l.ip === decodeURIComponent(u.pathname.split('/').at(-1))); if (index !== -1) leases.splice(index, 1); return new Response(null, { status: 204 }); }
    if (u.pathname.startsWith('/api/logs/')) return response({ log: [{ timestamp: now, message: 'Synthetic engine log: DNS engine ready' }], nextID: 1, pid: 123, file: '/synthetic/log' });
    if (u.pathname.startsWith('/api/search/')) return response({ search: { domains: domains.filter(d => d.domain.includes(decodeURIComponent(u.pathname.split('/').at(-1)))), gravity: [{ domain: 'telemetry.example', address: 'https://lists.example/balanced.txt', type: 'block', enabled: true, groups: [0] }], parameters: { N: 100, partial: u.searchParams.get('partial') === 'true' } } });
    if (u.pathname === '/api/info/system') return response({ system: { uptime: 3600, memory: { total: 1048576, used: 65536 }, load: { raw: [0.1, 0.2, 0.1] } } });
    if (u.pathname === '/api/info/ftl') return response({ ftl: { privacy_level: config.misc.privacylevel, pid: 123 } });
    if (u.pathname === '/api/info/database') return response({ database: { size: 102400, queries: 250 } });
    if (u.pathname === '/api/info/messages') return response({ messages: [] });
    if (u.pathname === '/api/network/interfaces') return response({ interfaces: [{ name: 'fixture0', addresses: [{ address: '192.0.2.8' }] }] });
    if (u.pathname === '/api/network/routes') return response({ routes: [{ dst: 'default', gateway: '192.0.2.1' }] });
    if (u.pathname === '/api/network/gateway') return response({ gateway: [{ address: '192.0.2.1', interface: 'fixture0' }] });
    if (u.pathname.startsWith('/api/action/') && u.pathname !== '/api/action/gravity') return response({ status: 'success' });
    if (u.pathname === '/api/action/gravity') return new Response('[✓] Done\n');
    if (u.pathname === '/api/dns/blocking') {
      if (expiresAt !== null && clock() >= expiresAt) {
        blocking = timerTarget ? 'enabled' : 'disabled';
        timer = null;
        expiresAt = null;
      }
      if (method === 'POST') {
        timerTarget = body.blocking === (blocking === 'enabled') ? true : !body.blocking;
        blocking = body.blocking ? 'enabled' : 'disabled';
        timer = body.timer;
        expiresAt = timer === null ? null : clock() + timer * 1000;
      }
      return response({ blocking, timer: expiresAt === null ? null : Math.max(0, (expiresAt - clock()) / 1000) });
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
      if (method === 'PUT') {
        const existing = domains.find(r => r.type === type && r.kind === kind && r.domain === decodeURIComponent(encoded));
        if (existing) Object.assign(existing, body);
      }
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
    if (u.pathname === '/api/groups') { if (method === 'POST') groups.push({ ...body, id: groups.length }); return response({ groups }); }
    if (u.pathname.startsWith('/api/groups/')) { const entry = groups.find(g => g.name === decodeURIComponent(u.pathname.slice(12))); if (method === 'PUT') Object.assign(entry, body); if (method === 'DELETE') groups.splice(groups.indexOf(entry), 1); return response({ groups }); }
    if (u.pathname === '/api/clients') { if (method === 'POST') clients.push({ ...body, id: clients.length + 1 }); return response({ clients }); }
    if (u.pathname.startsWith('/api/clients/')) { const identifier = decodeURIComponent(u.pathname.slice(13)), client = clients.find(c => c.client === identifier); if (method === 'PUT' && client) Object.assign(client, body); if (method === 'DELETE' && client) clients.splice(clients.indexOf(client), 1); return response({ clients: clients.filter(c => c.client === identifier) }); }
    if (u.pathname.startsWith('/api/lists/')) { const address = decodeURIComponent(u.pathname.slice('/api/lists/'.length)), list = lists.find(l => l.address === address && l.type === u.searchParams.get('type')); if (method === 'PUT' && list) Object.assign(list, body); if (method === 'DELETE' && list) lists.splice(lists.indexOf(list), 1); return response({ lists }); }
    if (u.pathname === '/api/lists') {
      if (method === 'POST')
        lists.push({ ...body, id: lists.length + 1, type: u.searchParams.get('type') ?? 'block', number: 0 });
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

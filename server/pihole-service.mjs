import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import catalog from '../config/blocklist-presets.json' with { type: 'json' };

export const fail = (status, message) =>
  Object.assign(new Error(message), { status });
export const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
};
export async function readJson(req, limit = 1048576) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw fail(415, 'JSON is required.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw fail(400, 'A JSON object is required.');
  }
}
function text(value, max = 253) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw fail(400, 'Invalid text value.');
  return value.trim();
}
export function hostname(value) {
  const raw = text(value);
  if (/[\s\/:@?#%\\]/.test(raw))
    throw fail(400, 'Enter a hostname, not a URL or path.');
  const name = domainToASCII(raw.replace(/\.$/, '')).toLowerCase();
  if (
    !name ||
    name.length > 253 ||
    isIP(name) ||
    name
      .split('.')
      .some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw fail(400, 'Enter a hostname, not a URL, IP address, or wildcard.');
  return name;
}

// The destination is administrator-configured, never supplied by a browser request.
export function createPiholeClient({
  url = '',
  password = '',
  writeEnabled = false,
  fetchImpl = fetch,
  timeoutMs = 8000,
  controlled = false,
} = {}) {
  let base;
  if (url) {
    base = new URL(url);
    if (
      !['http:', 'https:'].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !['/', '/api', '/api/'].includes(base.pathname)
    )
      throw Error(
        'PIHOLE_URL must be an HTTP(S) origin, optionally ending in /api.',
      );
    base.pathname = '/api/';
  }
  let sid = '',
    loginPromise,
    lastLoginFailure = 0,
    mutating = false;
  async function wire(path, method = 'GET', body, session = sid) {
    let response;
    try {
      response = await fetchImpl(new URL(path, base), {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'application/json',
          ...(session ? { 'X-FTL-SID': session } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      // Bounded streamed reads; an upstream cannot fill server memory with an unbounded body.
      let size = 0;
      const chunks = [];
      if (response.body)
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 8 * 1024 * 1024)
            throw fail(502, 'Pi-hole response exceeded the safety limit.');
          chunks.push(Buffer.from(chunk));
        }
      const raw = Buffer.concat(chunks).toString('utf8');
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw fail(
          502,
          'Pi-hole returned a non-JSON response. Check the API URL and version.',
        );
      }
      if (!response.ok || data.error) {
        if (response.status === 401)
          throw fail(401, 'Pi-hole authentication expired or was rejected.');
        if (response.status === 403)
          throw fail(
            502,
            'Pi-hole denied this operation. Check application-password permissions.',
          );
        throw fail(
          502,
          `Pi-hole rejected the operation (HTTP ${response.status}). Check the original Pi-hole interface for details.`,
        );
      }
      if (data.processed?.errors?.length)
        throw fail(
          502,
          'Pi-hole reported an item error. Refresh its current state before retrying.',
        );
      return data;
    } catch (error) {
      if (error.status) throw error;
      throw fail(
        502,
        method === 'GET'
          ? 'Pi-hole could not be reached. Check its address, certificate, and network connection.'
          : 'Pi-hole did not confirm the request. Refresh its state before retrying; the result is unknown.',
      );
    }
  }
  async function login() {
    if (!password) return;
    if (Date.now() - lastLoginFailure < 15000)
      throw fail(
        502,
        'Pi-hole authentication is cooling down. Check its password and retry shortly.',
      );
    if (!loginPromise)
      loginPromise = (async () => {
        try {
          const result = await wire('auth', 'POST', { password }, '');
          if (!result.session?.valid || typeof result.session.sid !== 'string')
            throw fail(
              502,
              'Pi-hole did not provide a valid session. Use an application password when 2FA is enabled.',
            );
          sid = result.session.sid;
        } catch (error) {
          lastLoginFailure = Date.now();
          throw fail(502, error.message);
        } finally {
          loginPromise = undefined;
        }
      })();
    await loginPromise;
  }
  async function request(path, method = 'GET', body) {
    if (!base)
      throw fail(
        503,
        'Pi-hole is not connected. Configure PIHOLE_URL in the server environment.',
      );
    if (password && !sid) await login();
    const usedSid = sid;
    try {
      return await wire(path, method, body);
    } catch (error) {
      if (error.status !== 401) throw error;
      if (!password)
        throw fail(
          502,
          'Pi-hole requires authentication. Configure its server-side application password.',
        );
      if (sid === usedSid) sid = '';
      // Never automatically replay a mutation. GET retries share one renewal session.
      if (method !== 'GET')
        throw fail(
          502,
          'Pi-hole session expired. Refresh the page before submitting again.',
        );
      if (!sid) await login();
      try {
        return await wire(path);
      } catch (retryError) {
        if (retryError.status === 401)
          throw fail(
            502,
            'Pi-hole rejected the renewed session. Check its application password.',
          );
        throw retryError;
      }
    }
  }
  const info = () => ({
    configured: !!base,
    writeEnabled: !!base && writeEnabled,
    adminUrl: base ? (controlled ? '/admin/' : new URL('/admin/', base).href) : null,
    controlled,
    source: 'Pi-hole v6 API',
    coverage: 'DNS requests only',
  });
  const readPaths = {
    domains: 'domains',
    lists: 'lists',
    groups: 'groups',
    clients: 'clients',
    localdns: 'config/dns/hosts',
    version: 'info/version',
  };
  return {
    info,
    async stockRead(path) {
      if (!controlled || !/^(?:stats|history|queries|domains|lists|groups|clients|config|info|network|dhcp|dns|search)(?:[/?]|$)/.test(path) || path.includes('..') || path.includes('\\')) throw fail(403, 'Unsupported stock view.');
      return request(path);
    },
    async read(resource, params = new URLSearchParams()) {
      if (resource === 'devices') {
        const [network, clients, groups] = await Promise.all([request('network/devices?max_devices=10000&max_addresses=32'), request('clients'), request('groups')]);
        if (!Array.isArray(network.devices) || !Array.isArray(clients.clients) || !Array.isArray(groups.groups)) throw fail(502, 'Device inventory is unavailable.');
        return { devices: network.devices, clients: clients.clients, groups: groups.groups, fetchedAt: new Date().toISOString(), coverage: 'Pi-hole observed devices only; silent, isolated, VPN and encrypted-DNS clients may be missing.', limit: 10000 };
      }
      if (resource === 'engine-config') return request('config');
      if (resource === 'overview') {
        const paths = {
          summary: 'stats/summary',
          blocking: 'dns/blocking',
          topClients: 'stats/top_clients?count=10',
          topDomains: 'stats/top_domains?count=10',
          topBlocked: 'stats/top_domains?count=10&blocked=true',
          upstreams: 'stats/upstreams',
          history: 'history',
          clientHistory: 'history/clients?N=8',
          queryTypes: 'stats/query_types',
        };
        const data = {},
          errors = {};
        await Promise.all(
          Object.entries(paths).map(async ([key, path]) => {
            try {
              const value = await request(path);
              if (
                ['history', 'clientHistory'].includes(key) &&
                !Array.isArray(value.history)
              )
                throw fail(502, 'History is unavailable in this response.');
              if (
                key === 'clientHistory' &&
                (!value.clients ||
                  typeof value.clients !== 'object' ||
                  Array.isArray(value.clients))
              )
                throw fail(
                  502,
                  'Client history is unavailable in this response.',
                );
              if (
                key === 'queryTypes' &&
                (!value.types ||
                  typeof value.types !== 'object' ||
                  Array.isArray(value.types))
              )
                throw fail(
                  502,
                  'Query types are unavailable in this response.',
                );
              data[key] = value;
            } catch (error) {
              errors[key] = error.message;
            }
          }),
        );
        if (!Object.keys(data).length)
          throw fail(502, Object.values(errors)[0]);
        return { ...info(), data, errors, fetchedAt: new Date().toISOString() };
      }
      if (resource === 'queries') {
        const query = new URLSearchParams({ length: '100' });
        for (const [key, value] of params) {
          if (
            ![
              'domain',
              'client_ip',
              'upstream',
              'type',
              'cursor',
              'from',
              'until',
            ].includes(key)
          )
            throw fail(400, 'Unsupported query filter.');
          if (!value) continue;
          if (key === 'cursor' && !/^\d{1,15}$/.test(value))
            throw fail(400, 'Invalid query cursor.');
          if (
            ['from', 'until'].includes(key) &&
            (!/^\d{1,12}(?:\.\d{1,6})?$/.test(value) ||
              !Number.isFinite(Number(value)))
          )
            throw fail(400, 'Invalid query time range.');
          query.set(key, text(value, 253));
        }
        if (
          query.has('from') &&
          query.has('until') &&
          Number(query.get('from')) > Number(query.get('until'))
        )
          throw fail(400, 'Query time range is reversed.');
        const data = await request('queries?' + query);
        if (!Array.isArray(data.queries))
          throw fail(502, 'Pi-hole returned an unsupported query response.');
        return {
          queries: data.queries,
          cursor: data.cursor ?? null,
          recordsTotal: data.recordsTotal ?? null,
          fetchedAt: new Date().toISOString(),
        };
      }
      if (!Object.hasOwn(readPaths, resource))
        throw fail(404, 'Unknown Pi-hole view.');
      const data = await request(readPaths[resource]);
      if (resource === 'localdns') {
        if (!Array.isArray(data.config?.dns?.hosts))
          throw fail(
            502,
            'Local DNS response is not supported by this Pi-hole version.',
          );
        return { hosts: data.config.dns.hosts };
      }
      if (resource !== 'version' && !Array.isArray(data[resource]))
        throw fail(502, 'Pi-hole returned an unsupported response.');
      return data;
    },
    async act(body) {
      if (!writeEnabled)
        throw fail(
          403,
          'Live changes are locked. Set PIHOLE_WRITE_ENABLED=true on the server to unlock them.',
        );
      if (body.confirmed !== true)
        throw fail(400, 'Confirm the exact live change first.');
      if (mutating)
        throw fail(
          409,
          'Another Pi-hole change is running. Refresh before retrying.',
        );
      if (['client-assign', 'group-save', 'group-delete', 'list-save', 'list-delete', 'config-set'].includes(body.action)) {
        mutating = true;
        try {
          const groupIds = (value) => {
            if (!Array.isArray(value) || !value.length || value.length > 100 || value.some(g => !Number.isInteger(g) || g < 0)) throw fail(400, 'Select at least one valid group.');
            return [...new Set(value)];
          };
          const comment = body.comment === null || body.comment === undefined ? null : text(body.comment, 1024);
          let path, method, payload, readback;
          if (body.action === 'client-assign') {
            const identifier = text(body.client, 253);
            if (!isIP(identifier) && !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(identifier)) throw fail(400, 'Use a device IPv4, IPv6, or MAC address.');
            const groups = groupIds(body.groups);
            const known = await request('groups');
            if (groups.some(id => !known.groups?.some(g => g.id === id))) throw fail(400, 'One of the selected groups no longer exists.');
            const existing = (await request('clients')).clients?.find(c => c.client.toLowerCase() === identifier.toLowerCase());
            if (JSON.stringify(existing ?? null) !== JSON.stringify(body.expected ?? null)) throw fail(409, 'Client settings changed. Reload the device before saving.');
            path = 'clients' + (existing ? '/' + encodeURIComponent(identifier) : '');
            method = existing ? 'PUT' : 'POST'; payload = { client: identifier, groups, comment: comment ?? existing?.comment ?? null };
            readback = 'clients/' + encodeURIComponent(identifier);
          } else if (body.action.startsWith('group-')) {
            const name = text(body.name, 128), previous = text(body.previous ?? name, 128);
            const existing = (await request('groups')).groups?.find(g => g.name === previous);
            if (!body.create && JSON.stringify(existing ?? null) !== JSON.stringify(body.expected ?? null)) throw fail(409, 'Group changed. Reload before saving.');
            if (body.action === 'group-delete' && existing?.id === 0) throw fail(400, 'The default group cannot be deleted.');
            if (body.action === 'group-delete' && previous === 'Default') throw fail(400, 'The default group cannot be deleted here.');
            method = body.action === 'group-delete' ? 'DELETE' : body.create === true ? 'POST' : 'PUT';
            if (method !== 'DELETE' && typeof body.enabled !== 'boolean') throw fail(400, 'Choose an enabled state.');
            path = 'groups' + (method === 'POST' ? '' : '/' + encodeURIComponent(previous));
            payload = method === 'DELETE' ? undefined : { name, enabled: body.enabled, comment }; readback = 'groups';
          } else if (body.action.startsWith('list-')) {
            const address = text(body.address, 2048), target = new URL(address);
            if (target.protocol !== 'https:' || target.username || target.password || target.hash) throw fail(400, 'Use a public HTTPS blocklist URL without credentials.');
            if (!['allow', 'block'].includes(body.type)) throw fail(400, 'Select an allow or block list.');
            const existing = (await request('lists')).lists?.find(l => l.address === address && l.type === body.type);
            if (!body.create && JSON.stringify(existing ?? null) !== JSON.stringify(body.expected ?? null)) throw fail(409, 'Subscription changed. Reload before saving.');
            method = body.action === 'list-delete' ? 'DELETE' : body.create === true ? 'POST' : 'PUT';
            path = 'lists' + (method === 'POST' ? '' : '/' + encodeURIComponent(address)) + '?type=' + body.type;
            if (method !== 'DELETE' && typeof body.enabled !== 'boolean') throw fail(400, 'Choose an enabled state.');
            payload = method === 'DELETE' ? undefined : { address, type: body.type, enabled: body.enabled, groups: groupIds(body.groups), comment }; readback = 'lists';
          } else {
            if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) throw fail(400, 'Provide a configuration object.');
            const sections = Object.keys(body.config);
            if (!sections.length || sections.some(key => !['dns', 'dhcp', 'ntp', 'resolver', 'database'].includes(key))) throw fail(400, 'Only DNS, DHCP, NTP, resolver and database settings are editable here. Listener, authentication and filesystem settings are managed by the installation.');
            // Do not silently relocate DNS or bypass the protected API listener.
            if (body.config.dns?.port !== undefined && body.config.dns.port !== 53) throw fail(400, 'DNS port is managed by the deployment.');
            const current = await request('config');
            for (const key of sections) if (JSON.stringify(current.config?.[key]) !== JSON.stringify(body.expected?.[key])) throw fail(409, 'Engine settings changed. Reload before saving.');
            const diff = (next, old) => {
              if (!next || typeof next !== 'object' || Array.isArray(next)) return JSON.stringify(next) === JSON.stringify(old) ? undefined : next;
              const result = {};
              if (Object.keys(old ?? {}).some(k => !Object.hasOwn(next, k))) throw fail(400, 'Do not remove configuration keys; set their explicit value instead.');
              for (const [key, value] of Object.entries(next)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw fail(400, 'Invalid configuration key.'); const changed = diff(value, old?.[key]); if (changed !== undefined) result[key] = changed; }
              return Object.keys(result).length ? result : undefined;
            };
            const changes = {};
            for (const key of sections) { const changed = diff(body.config[key], current.config[key]); if (changed !== undefined) changes[key] = changed; }
            if (!Object.keys(changes).length) return { ok: true, verified: current, message: 'No engine settings changed.' };
            path = 'config'; method = 'PATCH'; payload = { config: changes }; readback = 'config';
          }
          await request(path, method, payload);
          const verified = await request(readback);
          return { ok: true, verified, message: 'Engine accepted the change and current settings were read back. Test the affected device to verify its DNS behavior.' };
        } finally { mutating = false; }
      }
      let path, method, payload;
      if (body.action === 'blocking') {
        if (
          typeof body.blocking !== 'boolean' ||
          (body.timer !== null &&
            (!Number.isInteger(body.timer) ||
              body.timer < 60 ||
              body.timer > 86400))
        )
          throw fail(400, 'Select a valid blocking state and timer.');
        path = 'dns/blocking';
        method = 'POST';
        payload = { blocking: body.blocking, timer: body.timer };
      } else if (['domain-add', 'domain-delete'].includes(body.action)) {
        if (
          !['allow', 'deny'].includes(body.type) ||
          !['exact', 'regex'].includes(body.kind)
        )
          throw fail(400, 'Invalid domain rule type.');
        const domain =
          body.kind === 'exact'
            ? hostname(body.domain)
            : text(body.domain, 1024);
        path = `domains/${body.type}/${body.kind}`;
        method = body.action === 'domain-add' ? 'POST' : 'DELETE';
        if (method === 'POST') {
          const groups = body.groups;
          if (
            !Array.isArray(groups) ||
            !groups.length ||
            groups.length > 100 ||
            groups.some((g) => !Number.isInteger(g) || g < 0)
          )
            throw fail(400, 'Select at least one valid Pi-hole group.');
          if (
            typeof body.comment !== 'string' ||
            body.comment.length > 512 ||
            /[\x00-\x1f]/.test(body.comment)
          )
            throw fail(400, 'Invalid comment.');
          payload = {
            domain,
            comment: body.comment,
            groups: [...new Set(groups)],
            enabled: true,
          };
        } else path += '/' + encodeURIComponent(domain);
      } else if (body.action === 'privacy-list-add') {
        const source = catalog.sources.find(
          (s) =>
            s.id === body.sourceId &&
            ['hagezi-windows', 'hagezi-lg'].includes(s.id),
        );
        if (!source) throw fail(400, 'Choose a supported privacy pack.');
        if (
          !Array.isArray(body.groups) ||
          !body.groups.length ||
          body.groups.length > 100 ||
          body.groups.some((g) => !Number.isInteger(g) || g < 0)
        )
          throw fail(400, 'Select at least one Pi-hole group.');
        path = 'lists?type=block';
        method = 'POST';
        payload = {
          address: source.url,
          groups: [...new Set(body.groups)],
          enabled: true,
          comment: `Super Pi Hole: ${source.name}. Opt-in; review compatibility.`,
        };
      } else if (['local-dns-add', 'local-dns-delete'].includes(body.action)) {
        const ip = text(body.ip, 45),
          name = hostname(body.name);
        if (!isIP(ip)) throw fail(400, 'Enter a valid IPv4 or IPv6 address.');
        path = 'config/dns/hosts/' + encodeURIComponent(`${ip} ${name}`);
        method = body.action === 'local-dns-add' ? 'PUT' : 'DELETE';
      } else throw fail(400, 'Unknown or unsupported live operation.');
      mutating = true;
      try {
        if (body.action === 'privacy-list-add') {
          const existing = await request('lists');
          if (!Array.isArray(existing.lists))
            throw fail(502, 'Could not check existing subscriptions.');
          if (existing.lists.some((list) => list.address === payload.address))
            throw fail(
              409,
              'This source is already subscribed. Review its groups in the original Pi-hole interface; no subscription was changed.',
            );
          const known = await request('groups');
          if (
            !Array.isArray(known.groups) ||
            payload.groups.some(
              (id) =>
                !known.groups.some((group) => group.id === id && group.enabled),
            )
          )
            throw fail(400, 'Choose existing enabled Pi-hole groups.');
        }
        await request(path, method, payload);
        return {
          ok: true,
          message:
            body.action === 'privacy-list-add'
              ? 'Subscription added. Run Update Gravity in the original Pi-hole, verify its list download, and test the assigned devices. Blocking state was not changed. Remove or disable this list in the original interface to roll it back.'
              : 'Pi-hole accepted the change. Refresh to verify its current state.',
        };
      } finally {
        mutating = false;
      }
    },
  };
}

export function createLiveMiddleware(client) {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://internal');
    if (!url.pathname.startsWith('/live-api/')) return next?.();
    try {
      const resource = url.pathname.slice('/live-api/'.length);
      if (req.method === 'GET')
        return json(
          res,
          200,
          resource === 'status'
            ? client.info()
            : await client.read(resource, url.searchParams),
        );
      if (
        req.method === 'POST' &&
        resource === 'action' &&
        req.headers['x-super-pihole-review'] === '1'
      )
        return json(res, 200, await client.act(await readJson(req, 16384)));
      throw fail(405, 'Unsupported request.');
    } catch (error) {
      json(res, error.status ?? 500, {
        error: error.status ? error.message : 'Pi-hole request failed.',
      });
    }
  };
}

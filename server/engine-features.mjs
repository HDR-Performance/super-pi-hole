import {
  flattenSettings,
  validateSetting,
  settingPayload,
} from '../lib/engine-settings.mjs';
import { isIP } from 'node:net';

export const featureViews = new Set([
  'settings',
  'diagnostics',
  'logs',
  'search-lists',
  'leases',
  'historical',
]);
export const featureActions = new Set([
  'settings-save',
  'maintenance',
  'message-dismiss',
  'lease-delete',
  'domain-edit',
  'client-save',
  'client-delete',
]);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createEngineFeatures({ request, fail, hostname }) {
  return {
    async read(resource, params = new URLSearchParams()) {
      if (resource === 'historical') {
        if (
          [...params.keys()].some((k) => !['from', 'until'].includes(k)) ||
          !['from', 'until'].every((k) =>
            /^\d{1,12}$/.test(params.get(k) ?? ''),
          )
        )
          throw fail(400, 'Choose a start and end for stored statistics.');
        const from = Number(params.get('from')),
          until = Number(params.get('until'));
        if (from >= until || until - from > 366 * 86400)
          throw fail(400, 'Choose a forward interval of at most 366 days.');
        const range = new URLSearchParams({
          from: String(from),
          until: String(until),
        });
        const paths = {
          summary: 'stats/database/summary',
          history: 'history/database',
          clientHistory: 'history/database/clients',
          queryTypes: 'stats/database/query_types',
          upstreams: 'stats/database/upstreams',
          topDomains: 'stats/database/top_domains',
          topBlocked: 'stats/database/top_domains',
          topClients: 'stats/database/top_clients',
        };
        const data = {},
          errors = {};
        await Promise.all(
          Object.entries(paths).map(async ([key, path]) => {
            try {
              data[key] = await request(
                path +
                  '?' +
                  range +
                  (key.startsWith('top') ? '&count=10' : '') +
                  (key === 'topBlocked' ? '&blocked=true' : ''),
              );
            } catch (error) {
              errors[key] = error.message;
            }
          }),
        );
        return {
          data,
          errors,
          fetchedAt: new Date().toISOString(),
          from,
          until,
        };
      }
      if (resource === 'settings') {
        const data = await request('config?detailed=true');
        const fields = flattenSettings(data.config);
        if (!fields.length)
          throw fail(
            502,
            'This engine did not return editable settings metadata. Use the advanced editor or check version compatibility.',
          );
        return {
          fields,
          servers: data.dns_servers ?? [],
          fetchedAt: new Date().toISOString(),
        };
      }
      if (resource === 'leases') return request('dhcp/leases');
      if (resource === 'diagnostics') {
        const paths = {
          system: 'info/system',
          engine: 'info/ftl',
          database: 'info/database',
          version: 'info/version',
          messages: 'info/messages',
          interfaces: 'network/interfaces',
          routes: 'network/routes',
          gateway: 'network/gateway',
        };
        const data = {},
          errors = {};
        await Promise.all(
          Object.entries(paths).map(async ([key, path]) => {
            try {
              data[key] = await request(path);
            } catch (error) {
              errors[key] = error.message;
            }
          }),
        );
        return { data, errors, fetchedAt: new Date().toISOString() };
      }
      if (resource === 'search-lists') {
        if ([...params.keys()].some((k) => !['domain', 'partial'].includes(k)))
          throw fail(400, 'Unsupported search filter.');
        const domain = hostname(params.get('domain'));
        return request(
          `search/${encodeURIComponent(domain)}?N=100&partial=${params.get('partial') === 'true'}`,
        );
      }
      if (resource === 'logs') {
        if ([...params.keys()].some((k) => !['file', 'nextID'].includes(k)))
          throw fail(400, 'Unsupported log filter.');
        const file = params.get('file') ?? 'ftl',
          next = params.get('nextID');
        if (
          !['dnsmasq', 'ftl', 'webserver'].includes(file) ||
          (next !== null && !/^\d{1,12}$/.test(next))
        )
          throw fail(400, 'Select a supported log and cursor.');
        const data = await request(
          `logs/${file}${next ? '?nextID=' + next : ''}`,
        );
        if (!Array.isArray(data.log))
          throw fail(502, 'The engine did not return log entries.');
        return {
          ...data,
          log: data.log.slice(-300).map((row) => ({
            ...row,
            message: String(row.message)
              .slice(0, 4096)
              .replace(
                /((?:password|sid|token|authorization)\s*[=:]\s*)[^\s&,;]+/gi,
                '$1[redacted]',
              ),
          })),
        };
      }
      throw fail(404, 'Unknown diagnostics view.');
    },
    async act(body) {
      if (['client-save', 'client-delete'].includes(body.action)) {
        const id = body.client;
        const cidr = typeof id === 'string' ? id.split('/') : [];
        const version = isIP(cidr[0] ?? '');
        const valid =
          typeof id === 'string' &&
          id.length <= 253 &&
          (isIP(id) ||
            /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(id) ||
            /^:[A-Za-z0-9_.-]{1,15}$/.test(id) ||
            (cidr.length === 2 &&
              version &&
              /^\d{1,3}$/.test(cidr[1]) &&
              Number(cidr[1]) <= (version === 4 ? 32 : 128)) ||
            /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/.test(id));
        if (!valid)
          throw fail(
            400,
            'Use a valid IP, CIDR subnet, MAC, hostname or :interface.',
          );
        const existing = (await request('clients')).clients?.find(
          (c) => c.client.toLowerCase() === id.toLowerCase(),
        );
        if (!equal(existing ?? null, body.expected ?? null))
          throw fail(409, 'Client assignment changed. Reload before saving.');
        if (body.action === 'client-delete') {
          if (!existing)
            throw fail(409, 'That client assignment no longer exists.');
          await request(
            'clients/' + encodeURIComponent(existing.client),
            'DELETE',
          );
          if (
            (await request('clients')).clients?.some(
              (c) => c.id === existing.id,
            )
          )
            throw fail(
              502,
              'Deletion was submitted but the assignment is still present. Reload before retrying.',
            );
          return {
            ok: true,
            message:
              'Client assignment removed and verified. The device was not disconnected.',
          };
        }
        if (
          !Array.isArray(body.groups) ||
          body.groups.length > 100 ||
          body.groups.some((g) => !Number.isSafeInteger(g) || g < 0) ||
          (body.comment !== null &&
            (typeof body.comment !== 'string' ||
              body.comment.length > 1024 ||
              [...body.comment].some((c) => c.charCodeAt(0) < 32)))
        )
          throw fail(400, 'Choose valid groups and a comment.');
        const known = (await request('groups')).groups;
        if (
          !Array.isArray(known) ||
          body.groups.some((id) => !known.some((g) => g.id === id))
        )
          throw fail(400, 'A selected group no longer exists.');
        const payload = {
          client: id,
          groups: [...new Set(body.groups)],
          comment: body.comment,
        };
        await request(
          'clients' +
            (existing ? '/' + encodeURIComponent(existing.client) : ''),
          existing ? 'PUT' : 'POST',
          payload,
        );
        const verified = (await request('clients')).clients?.find(
          (c) => c.client.toLowerCase() === id.toLowerCase(),
        );
        if (
          !verified ||
          !equal(
            [...verified.groups].sort((a, b) => a - b),
            [...payload.groups].sort((a, b) => a - b),
          ) ||
          verified.comment !== payload.comment
        )
          throw fail(
            502,
            'Client assignment was submitted but readback differs. Reload before retrying.',
          );
        return {
          ok: true,
          message: 'Client assignment saved and verified in Pi-hole.',
        };
      }
      if (body.action === 'domain-edit') {
        if (
          !['allow', 'deny'].includes(body.type) ||
          !['exact', 'regex'].includes(body.kind) ||
          !['allow', 'deny'].includes(body.nextType) ||
          typeof body.enabled !== 'boolean' ||
          typeof body.domain !== 'string' ||
          !body.domain ||
          body.domain.length > 1024 ||
          !Array.isArray(body.groups) ||
          body.groups.length > 100 ||
          body.groups.some((g) => !Number.isSafeInteger(g) || g < 0) ||
          (body.comment !== null &&
            (typeof body.comment !== 'string' ||
              body.comment.length > 512 ||
              [...body.comment].some((c) => c.charCodeAt(0) < 32)))
        )
          throw fail(
            400,
            'Choose a valid domain rule, enabled state, comment and groups.',
          );
        const domain =
          body.kind === 'exact' ? hostname(body.domain) : body.domain;
        const existing = (await request('domains')).domains?.find(
          (r) =>
            r.domain === domain && r.type === body.type && r.kind === body.kind,
        );
        if (!existing || !equal(existing, body.expected))
          throw fail(409, 'This rule changed. Reload before editing it.');
        const known = (await request('groups')).groups;
        if (
          !Array.isArray(known) ||
          body.groups.some((id) => !known.some((g) => g.id === id))
        )
          throw fail(400, 'A selected group no longer exists.');
        const payload = {
          type: body.nextType,
          kind: body.kind,
          enabled: body.enabled,
          comment: body.comment,
          groups: [...new Set(body.groups)],
        };
        await request(
          `domains/${body.type}/${body.kind}/${encodeURIComponent(domain)}`,
          'PUT',
          payload,
        );
        const verified = (await request('domains')).domains?.find(
          (r) =>
            r.id === existing.id &&
            r.domain === domain &&
            r.type === body.nextType &&
            r.kind === body.kind,
        );
        if (
          !verified ||
          verified.enabled !== payload.enabled ||
          verified.comment !== payload.comment ||
          !equal(
            [...verified.groups].sort((a, b) => a - b),
            [...payload.groups].sort((a, b) => a - b),
          )
        )
          throw fail(
            502,
            'The rule was submitted but readback differs. Reload before retrying.',
          );
        return {
          ok: true,
          message: 'Domain rule updated and verified in Pi-hole.',
        };
      }
      if (body.action === 'settings-save') {
        if (
          !Array.isArray(body.changes) ||
          !body.changes.length ||
          body.changes.length > 50
        )
          throw fail(400, 'Choose 1 to 50 setting changes.');
        const fields = flattenSettings(
          (await request('config?detailed=true')).config,
        );
        const seen = new Set();
        for (const change of body.changes) {
          const field = fields.find((f) => f.path === change?.path);
          if (!field?.editable || seen.has(change.path))
            throw fail(
              400,
              'An unsupported, deployment-managed or duplicate setting was submitted.',
            );
          seen.add(change.path);
          if (!equal(field.value, change.expected))
            throw fail(
              409,
              `${change.path} changed since it was loaded. Reload before saving.`,
            );
          const error = validateSetting(field, change.value);
          if (error) throw fail(400, `${change.path}: ${error}`);
          if (
            change.path === 'dhcp.active' &&
            change.value &&
            body.dhcpAcknowledged !== true
          )
            throw fail(
              400,
              'Confirm that no competing DHCP server is active before enabling DHCP.',
            );
        }
        await request('config', 'PATCH', {
          config: settingPayload(body.changes),
        });
        let readback;
        try {
          readback = flattenSettings(
            (await request('config?detailed=true')).config,
          );
        } catch {
          throw fail(
            502,
            'Settings were submitted, but the engine may be restarting. Reload to verify; do not blindly resubmit.',
          );
        }
        if (
          body.changes.some(
            (c) =>
              !equal(readback.find((f) => f.path === c.path)?.value, c.value),
          )
        )
          throw fail(
            502,
            'Settings were submitted but readback differs. Reload and review before retrying.',
          );
        return {
          ok: true,
          message:
            'Changed settings saved and read back from Pi-hole. Unrelated settings were retained.',
        };
      }
      if (body.action === 'maintenance') {
        const paths = {
          restartdns: 'action/restartdns',
          'flush-logs': 'action/flush/logs',
          'flush-network': 'action/flush/network',
          'flush-arp': 'action/flush/arp',
        };
        if (
          !Object.hasOwn(paths, body.operation) ||
          body.acknowledgement !== body.operation
        )
          throw fail(400, 'Confirm the specific maintenance operation.');
        await request(paths[body.operation], 'POST');
        return {
          ok: true,
          message:
            'Pi-hole accepted the maintenance request. Refresh diagnostics to verify completion.',
        };
      }
      if (body.action === 'message-dismiss') {
        if (!Number.isSafeInteger(body.id) || body.id < 0)
          throw fail(400, 'Invalid diagnostic message.');
        await request('info/messages/' + body.id, 'DELETE');
        return {
          ok: true,
          message:
            'Diagnostic message dismissed. This does not fix its underlying cause.',
        };
      }
      if (body.action === 'lease-delete') {
        const leases = (await request('dhcp/leases')).leases;
        const existing = leases?.find((lease) => lease.ip === body.ip);
        if (!existing || !equal(existing, body.expected))
          throw fail(409, 'The lease changed. Reload before removing it.');
        await request(
          'dhcp/leases/' + encodeURIComponent(existing.ip),
          'DELETE',
        );
        return {
          ok: true,
          message:
            'Lease removed. The device may request a new lease; this does not block the device.',
        };
      }
      throw fail(400, 'Unknown engine action.');
    },
  };
}

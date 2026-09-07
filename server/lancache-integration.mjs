import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

const owner = 'super-pi-hole-lancache:v1';
const capabilities = ['status.read', 'services.read'];
const initial = () => ({
  contractVersion: 1,
  enabled: false,
  managementUrl: '',
  pinnedInstanceId: null,
  connection: { state: 'Off', checkedAt: null, error: null, version: null, instanceId: null, capabilities: [], contentAddresses: { ipv4: [], ipv6: [] }, peerManagementUrl: null },
  catalog: null,
  routes: { state: 'none', selectedServices: [], ownerInstanceId: null, contractVersion: 1, catalogRevision: null, configurationRevision: null, contentAddresses: { ipv4: [], ipv6: [] }, managedLines: [], appliedAt: null, lastVerifiedAt: null, rollback: null },
});

const bad = (status, message, code = 'INVALID_REQUEST') => Object.assign(new Error(message), { status, code });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cleanText = (value, name, max = 256) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw bad(400, `Invalid ${name}.`);
  return value.trim();
};
const privateIp = (value) => {
  if (isIP(value) === 4) {
    const p = value.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
  }
  if (isIP(value) === 6) return value === '::1' || /^[fF][c-dC-D]/.test(value);
  return false;
};
export function managementUrl(value) {
  let url;
  try { url = new URL(cleanText(value, 'LanCache management URL', 2048)); } catch { throw bad(400, 'Enter a valid HTTP(S) LanCache management URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !privateIp(url.hostname.replace(/^\[|\]$/g, ''))) throw bad(400, 'LanCache management must use an explicit private-LAN HTTP(S) address without credentials, a path, query, or fragment.');
  return url.origin + '/';
}
function hostname(value) {
  const name = cleanText(value, 'service domain', 253).toLowerCase().replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) throw bad(502, 'LanCache returned an invalid service domain.', 'PEER_SCHEMA');
  return name;
}
function seal(value, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
function open(value, key) {
  const raw = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
function loadKey(path) {
  if (!existsSync(path)) { writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' }); }
  chmodSync(path, 0o600);
  const key = readFileSync(path);
  if (key.length !== 32) throw Error('LanCache integration key is invalid. Preserve the database and restore its matching key.');
  return key;
}
function safe(state, revision, hasToken) { return { revision, ...state, hasToken, pairingToken: hasToken ? '••••••••' : '', owner }; }
function validateCatalog(value) {
  if (!value || typeof value.revision !== 'string' || !value.revision || value.revision.length > 256 || !Array.isArray(value.services) || value.services.length > 200) throw bad(502, 'LanCache returned an incompatible service catalog.', 'PEER_SCHEMA');
  const ids = new Set();
  const services = value.services.map((service) => {
    const id = cleanText(service?.id, 'service identifier', 64);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || ids.has(id)) throw bad(502, 'LanCache returned duplicate or invalid service identifiers.', 'PEER_SCHEMA');
    ids.add(id);
    if (!Array.isArray(service.domains) || service.domains.length > 10000) throw bad(502, 'LanCache returned an invalid domain catalog.', 'PEER_SCHEMA');
    return { id, name: cleanText(service.name ?? id, 'service name', 128), domains: service.domains.map((rule) => {
      if (!['exact', 'wildcard'].includes(rule?.type)) throw bad(502, 'LanCache returned an unsupported domain-rule type.', 'PEER_SCHEMA');
      return { type: rule.type, domain: hostname(rule.domain) };
    }) };
  });
  if (new Set(services.flatMap((s) => s.domains.map((d) => `${d.type}:${d.domain}`))).size !== services.flatMap((s) => s.domains).length) throw bad(502, 'LanCache returned overlapping duplicate domain rules.', 'PEER_SCHEMA');
  return { revision: value.revision, services };
}
function validateIdentity(value) {
  if (!value || Number(value.apiVersion) !== 1 || value.product !== 'lancache' || typeof value.version !== 'string' || !value.version || typeof value.instanceId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(value.instanceId) || !Array.isArray(value.capabilities)) throw bad(502, 'The peer is not a compatible LanCache integration API.', 'INCOMPATIBLE');
  const caps = [...new Set(value.capabilities.filter((x) => typeof x === 'string'))];
  if (capabilities.some((x) => !caps.includes(x))) throw bad(502, `LanCache is missing required capabilities: ${capabilities.filter((x) => !caps.includes(x)).join(', ')}.`, 'INCOMPATIBLE');
  return { version: value.version, instanceId: value.instanceId, capabilities: caps };
}
function validateStatus(value) {
  const ipv4 = value?.contentAddresses?.ipv4 ?? [], ipv6 = value?.contentAddresses?.ipv6 ?? [];
  if (typeof value?.engine?.healthy !== 'boolean' || !Array.isArray(ipv4) || !Array.isArray(ipv6) || [...ipv4, ...ipv6].some((ip) => !privateIp(ip)) || !ipv4.length) throw bad(502, 'LanCache returned invalid or unsafe content addresses.', 'PEER_SCHEMA');
  return { engine: { healthy: value.engine.healthy }, sampledAt: typeof value.sampledAt === 'string' ? value.sampledAt : new Date().toISOString(), contentAddresses: { ipv4: [...new Set(ipv4)], ipv6: [...new Set(ipv6)] }, managementUrl: value.managementUrl ? managementUrl(value.managementUrl) : null };
}

export function createLanCacheIntegration({ path, pihole, fetchImpl = fetch, clock = Date.now }) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS lancache_integration (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL, token_cipher TEXT);');
  db.prepare('INSERT OR IGNORE INTO lancache_integration VALUES(1,0,?,NULL)').run(JSON.stringify(initial()));
  const key = path === ':memory:' ? randomBytes(32) : loadKey(path + '.key');
  const row = () => db.prepare('SELECT revision,body,token_cipher FROM lancache_integration WHERE id=1').get();
  const read = () => { const r = row(); return { revision: r.revision, state: JSON.parse(r.body), token: r.token_cipher ? open(r.token_cipher, key) : '' }; };
  const save = (expectedRevision, state, token) => {
    const current = read();
    if (!Number.isSafeInteger(expectedRevision) || current.revision !== expectedRevision) throw bad(409, 'LanCache integration changed in another tab. Reload before saving.', 'STALE_REVISION');
    const result = db.prepare('UPDATE lancache_integration SET revision=revision+1,body=?,token_cipher=? WHERE id=1 AND revision=?').run(JSON.stringify(state), token ? seal(token, key) : null, expectedRevision);
    if (!result.changes) throw bad(409, 'LanCache integration changed. Reload before saving.', 'STALE_REVISION');
    return snapshot();
  };
  const snapshot = () => { const current = read(); return safe(current.state, current.revision, !!current.token); };
  const request = async (base, token, pathname) => {
    const response = await fetchImpl(new URL(pathname, base), { redirect: 'error', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw bad(response.status === 401 || response.status === 403 ? 401 : 502, response.status === 401 || response.status === 403 ? 'LanCache rejected the pairing token.' : `LanCache returned HTTP ${response.status}.`, response.status === 401 || response.status === 403 ? 'PAIRING_REJECTED' : 'PEER_ERROR');
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 524288) throw bad(502, 'LanCache response exceeded 512 KiB.', 'PEER_RESPONSE_LIMIT');
    const text = await response.text();
    if (Buffer.byteLength(text) > 524288) throw bad(502, 'LanCache response exceeded 512 KiB.', 'PEER_RESPONSE_LIMIT');
    try { return JSON.parse(text); } catch { throw bad(502, 'LanCache returned a non-JSON response.', 'PEER_SCHEMA'); }
  };
  const connectionFailure = (current, error) => {
    const state = { ...current.state, connection: { ...current.state.connection, state: error.code === 'INCOMPATIBLE' || error.code === 'PEER_SCHEMA' ? 'Incompatible' : error.code === 'PAIRING_REJECTED' ? 'Not paired' : 'Unreachable', checkedAt: new Date(clock()).toISOString(), error: error.message } };
    save(current.revision, state, current.token);
    throw error;
  };
  const test = async () => {
    const current = read();
    if (!current.state.enabled) throw bad(409, 'Enable the LanCache integration before testing.', 'OFF');
    if (!current.state.managementUrl || !current.token) throw bad(409, 'Enter the management URL and pairing token first.', 'NOT_PAIRED');
    try {
      const identity = validateIdentity(await request(current.state.managementUrl, current.token, '/api/integrations/v1/identity'));
      if (current.state.pinnedInstanceId && current.state.pinnedInstanceId !== identity.instanceId) throw bad(409, 'LanCache instance identity changed. Clear pairing before trusting the replacement.', 'INCOMPATIBLE');
      const status = validateStatus(await request(current.state.managementUrl, current.token, '/api/integrations/v1/status'));
      const catalog = validateCatalog(await request(current.state.managementUrl, current.token, '/api/integrations/v1/services'));
      const state = { ...current.state, pinnedInstanceId: identity.instanceId, catalog, connection: { state: status.engine.healthy ? (current.state.routes.state === 'applied' ? 'Routes applied' : 'Connected') : 'Unreachable', checkedAt: new Date(clock()).toISOString(), error: status.engine.healthy ? null : 'LanCache engine reported unhealthy.', ...identity, contentAddresses: status.contentAddresses, peerManagementUrl: status.managementUrl } };
      return save(current.revision, state, current.token);
    } catch (error) { return connectionFailure(current, error?.status ? error : bad(502, 'LanCache could not be reached.', 'UNREACHABLE')); }
  };
  const linesFor = (state, selectedServices) => {
    if (!state.catalog || !state.pinnedInstanceId || !state.connection.contentAddresses.ipv4.length) throw bad(409, 'Test a compatible LanCache connection before previewing routes.', 'NOT_CONNECTED');
    if (!Array.isArray(selectedServices) || selectedServices.length > 100 || selectedServices.some((id) => typeof id !== 'string')) throw bad(400, 'Select valid LanCache services.');
    const chosen = [...new Set(selectedServices)], known = new Map(state.catalog.services.map((s) => [s.id, s]));
    if (chosen.some((id) => !known.has(id))) throw bad(409, 'The LanCache service catalog changed. Test the connection again.', 'CATALOG_CHANGED');
    const ips = [...state.connection.contentAddresses.ipv4, ...state.connection.contentAddresses.ipv6];
    const lines = [`# ${owner}:begin:${state.pinnedInstanceId}`];
    for (const id of chosen.sort()) for (const rule of known.get(id).domains) {
      if (rule.type === 'exact') lines.push(`host-record=${rule.domain},${ips.join(',')}`);
      else {
        lines.push(`local=/${rule.domain}/`);
        for (const ip of ips) lines.push(`address=/${rule.domain}/${ip}`);
      }
    }
    lines.push(`# ${owner}:end:${state.pinnedInstanceId}`);
    if (lines.length > 20002) throw bad(400, 'The selected route set exceeds the 20,000-line safety limit.');
    return { chosen, lines };
  };
  const preview = async (selectedServices) => {
    const current = read(), desired = linesFor(current.state, selectedServices), engine = await pihole.integrationState();
    const owned = new Set(current.state.routes.managedLines ?? []), unmanaged = engine.lines.filter((line) => !owned.has(line));
    const routedDomains = [...new Set(desired.lines.flatMap((line) => [...line.matchAll(/(?:host-record=|address=\/|local=\/)([^,\/]+)/g)].map((m) => m[1])))];
    const conflicts = unmanaged.filter((line) => routedDomains.some((domain) => line.includes(domain)));
    const next = [...unmanaged, ...desired.lines];
    const plan = { configurationRevision: current.revision, catalogRevision: current.state.catalog.revision, selectedServices: desired.chosen, contentAddresses: current.state.connection.contentAddresses, add: desired.lines.filter((line) => !engine.lines.includes(line)), remove: engine.lines.filter((line) => owned.has(line) && !desired.lines.includes(line)), conflicts, expectedEngineHash: hash(engine.lines), nextEngineHash: hash(next), routeCount: routedDomains.length };
    return { ...plan, previewHash: hash(plan) };
  };
  const apply = async ({ revision, selectedServices, previewHash }) => {
    const current = read();
    if (!current.state.enabled) throw bad(409, 'Enable the LanCache integration first.', 'OFF');
    if (revision !== current.revision) throw bad(409, 'Integration settings changed. Create a new preview.', 'STALE_REVISION');
    const plan = await preview(selectedServices);
    if (plan.previewHash !== previewHash) throw bad(409, 'The route preview is stale. Review the new changes.', 'STALE_PREVIEW');
    if (plan.conflicts.length) throw bad(409, 'Existing unmanaged dnsmasq rules overlap these LanCache domains. Resolve the conflicts before applying.', 'ROUTE_CONFLICT');
    const engine = await pihole.integrationState();
    if (hash(engine.lines) !== plan.expectedEngineHash) throw bad(409, 'Pi-hole DNS settings changed after preview. Preview again.', 'STALE_ENGINE');
    const desired = linesFor(current.state, selectedServices), owned = new Set(current.state.routes.managedLines ?? []), next = [...engine.lines.filter((line) => !owned.has(line)), ...desired.lines];
    const now = new Date(clock()).toISOString();
    const routes = { state: 'applying', selectedServices: desired.chosen, ownerInstanceId: current.state.pinnedInstanceId, contractVersion: 1, catalogRevision: current.state.catalog.revision, configurationRevision: current.revision + 1, contentAddresses: current.state.connection.contentAddresses, managedLines: desired.lines, appliedAt: null, lastVerifiedAt: null, rollback: { previousLines: engine.lines, previousLinesHash: hash(engine.lines), appliedLinesHash: hash(next), managedLines: current.state.routes.managedLines ?? [] } };
    save(current.revision, { ...current.state, routes, connection: { ...current.state.connection, state: 'Routes pending' } }, current.token);
    try { await pihole.replaceIntegrationLines(engine.lines, next); }
    catch (error) {
      const latest = read();
      save(latest.revision, { ...latest.state, routes: { ...latest.state.routes, state: 'attention' }, connection: { ...latest.state.connection, state: 'Routes pending', error: 'Pi-hole did not confirm the route apply. Inspect current DNS before retrying.' } }, latest.token);
      throw error;
    }
    const latest = read();
    return save(latest.revision, { ...latest.state, routes: { ...latest.state.routes, state: 'applied', appliedAt: now, lastVerifiedAt: now }, connection: { ...latest.state.connection, state: 'Routes applied', error: null } }, latest.token);
  };
  const rollback = async (expectedRevision) => {
    const current = read();
    if (expectedRevision !== current.revision) throw bad(409, 'Integration settings changed. Reload before restoring routes.', 'STALE_REVISION');
    if (current.state.routes.state !== 'applied') return snapshot();
    const engine = await pihole.integrationState(), managed = current.state.routes.managedLines ?? [];
    if (managed.some((line) => !engine.lines.includes(line))) throw bad(409, 'Managed LanCache DNS lines changed outside this controller. No routes were removed.', 'ROUTE_DRIFT');
    save(current.revision, { ...current.state, routes: { ...current.state.routes, state: 'restoring' }, connection: { ...current.state.connection, state: 'Routes pending' } }, current.token);
    try { await pihole.replaceIntegrationLines(engine.lines, engine.lines.filter((line) => !managed.includes(line))); }
    catch (error) {
      const latest = read();
      save(latest.revision, { ...latest.state, routes: { ...latest.state.routes, state: 'attention' }, connection: { ...latest.state.connection, state: 'Routes pending', error: 'Route restore was not confirmed. Managed state was retained for recovery.' } }, latest.token);
      throw error;
    }
    const latest = read();
    return save(latest.revision, { ...latest.state, routes: { ...initial().routes, rollback: latest.state.routes.rollback }, connection: { ...latest.state.connection, state: 'Connected', error: null } }, latest.token);
  };
  return {
    snapshot,
    close: () => db.close(),
    test,
    preview,
    apply,
    rollback,
    async configure(body) {
      const current = read();
      if (body.revision !== current.revision) throw bad(409, 'LanCache integration changed. Reload before saving.', 'STALE_REVISION');
      if (typeof body.enabled !== 'boolean') throw bad(400, 'Choose whether LanCache integration is enabled.');
      if (!body.enabled && current.state.routes.state === 'applied') await rollback(current.revision);
      const latest = read();
      const url = body.managementUrl ? managementUrl(body.managementUrl) : '';
      let token = latest.token;
      if (body.clearPairing === true) token = '';
      else if (body.pairingToken !== undefined && body.pairingToken !== '') token = cleanText(body.pairingToken, 'pairing token', 1024);
      const state = { ...latest.state, enabled: body.enabled, managementUrl: url, pinnedInstanceId: body.clearPairing ? null : latest.state.pinnedInstanceId, catalog: body.clearPairing ? null : latest.state.catalog, connection: { ...(body.clearPairing ? initial().connection : latest.state.connection), state: body.enabled ? (token && url ? 'Not paired' : 'Not paired') : 'Off', error: null } };
      return save(latest.revision, state, token);
    },
  };
}

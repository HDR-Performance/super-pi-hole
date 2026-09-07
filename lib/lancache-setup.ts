export type SetupCode = { format: 'lancache-setup'; version: 1; managementUrl: string; pairingToken: string; instanceId: string };
export type SetupState = { revision: number; enabled: boolean; managementUrl: string; hasToken: boolean; pinnedInstanceId: string | null; connection: { state: string }; catalog: { services: { id: string }[] } | null; routes: { state: string; selectedServices: string[] } };
export type RoutePreview = { configurationRevision: number; selectedServices: string[]; previewHash: string };
type Request = <T>(path: string, body?: unknown) => Promise<T>;

export function sameServerUrl(origin: string, port = 20722) {
  const url = new URL(origin); url.port = String(port); url.pathname = '/'; url.search = ''; url.hash = ''; return url.href;
}

export function parseSetupCode(text: string): SetupCode {
  if (text.length > 4096) throw Error('Setup code is too long. Copy a fresh code from LanCache Settings.');
  let code: SetupCode;
  try { code = JSON.parse(text.trim()); } catch { throw Error('Paste the complete setup code from LanCache Settings.'); }
  if (!code || code.format !== 'lancache-setup' || code.version !== 1 || typeof code.managementUrl !== 'string' || typeof code.pairingToken !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(code.pairingToken) || typeof code.instanceId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(code.instanceId)) throw Error('This is not a supported LanCache setup code.');
  const url = new URL(code.managementUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('The setup code must contain a plain LanCache management address.');
  return { format: 'lancache-setup', version: 1, managementUrl: url.href, pairingToken: code.pairingToken, instanceId: code.instanceId };
}

export function presetServices(preset: string, available: string[], retained: string[] = []) {
  const gaming = ['steam', 'epicgames', 'blizzard', 'origin', 'uplay', 'riot', 'xboxlive'];
  const wanted = preset === 'all' ? available : preset === 'gaming' ? gaming : ['steam'];
  return [...new Set([...retained, ...wanted.filter(id => available.includes(id))])].sort();
}

// Pair and prepare a real preview. Only the separate reviewed apply action may write DNS.
export async function prepareSetup<S extends SetupState, P extends RoutePreview>(request: Request, options: { code?: SetupCode; managementUrl: string; pairingToken: string; preset: string }): Promise<{ state: S; preview: P }> {
  let state = await request<S>('integrations/lancache');
  const managementUrl = options.code?.managementUrl || options.managementUrl;
  const pairingToken = options.code?.pairingToken || options.pairingToken;
  if (state.pinnedInstanceId && options.code && state.pinnedInstanceId !== options.code.instanceId) throw Error('This code belongs to another cache. Restore routes and clear the existing pairing before switching servers.');
  if (state.routes.state !== 'none' && state.managementUrl && new URL(state.managementUrl).href !== new URL(managementUrl).href) throw Error('Restore the existing cache routes before changing servers.');
  if (!state.enabled || state.managementUrl !== managementUrl || pairingToken) {
    state = await request<S>('integrations/lancache/configure', { revision: state.revision, enabled: true, managementUrl, pairingToken });
  }
  state = await request<S>('integrations/lancache/test', {});
  if (!['Connected', 'Routes applied'].includes(state.connection.state) || !state.catalog) throw Error('The cache engine is not ready. Resolve the connection error before enabling downloads.');
  if (options.code && state.pinnedInstanceId !== options.code.instanceId) throw Error('The server identity does not match the setup code. DNS was not changed.');
  const selectedServices = presetServices(options.preset, state.catalog.services.map(s => s.id), state.routes.selectedServices);
  if (!selectedServices.length) throw Error('This cache does not advertise any services in the selected preset.');
  const preview = await request<P>('integrations/lancache/preview', { selectedServices });
  return { state, preview };
}

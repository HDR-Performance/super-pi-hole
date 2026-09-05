import { fail, json } from './pihole-service.mjs';

// Only invoked after Super Pi Hole authentication and origin checks.
export function createStockInterface(client, { enabled = false, url, fetchImpl = fetch } = {}) {
  if (enabled && !['127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw Error('Controlled stock interface requires a loopback engine URL.');
  return async (req, res) => {
    if (!enabled) throw fail(404, 'The controlled stock interface is available in integrated mode.');
    const path = new URL(req.url, 'http://internal');
    if (/%|\\|\/\//.test(path.pathname)) throw fail(400, 'Invalid stock interface path.');
    if (path.pathname.startsWith('/api/')) {
      // The stock UI is a read-only viewer. Never forward a browser-supplied SID.
      if (path.pathname === '/api/auth' && ['GET', 'POST'].includes(req.method)) return json(res, 200, { session: { valid: true, totp: false, sid: 'super-pi-hole-read-only', csrf: 'super-pi-hole-read-only', validity: 3600, message: 'Read-only: use Super Pi Hole to change settings.' } });
      if (req.method !== 'GET') throw fail(403, 'The original interface is read-only. Make changes in Super Pi Hole.');
      if (path.pathname === '/api/teleporter') { const archive = await client.exportSettings(); res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="super-pi-hole-settings.zip"' }); return res.end(archive); }
      return json(res, 200, await client.stockRead(path.pathname.slice(5) + path.search));
    }
    if (!['GET', 'HEAD'].includes(req.method) || !path.pathname.startsWith('/admin/')) throw fail(403, 'The original interface is read-only.');
    const upstream = await fetchImpl(new URL(path.pathname + path.search, url), { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = new URL(upstream.headers.get('location') ?? '/admin/', url);
      if (location.origin !== new URL(url).origin || !location.pathname.startsWith('/admin/')) throw fail(502, 'Unexpected engine redirect.');
      res.writeHead(302, { Location: location.pathname + location.search }); return res.end();
    }
    if (!upstream.ok) throw fail(502, 'The stock interface is unavailable.');
    // The trusted, pinned original UI uses inline scripts. This relaxation is
    // limited to its authenticated pages, never applied to our application.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
    let size = 0;
    const chunks = [];
    for await (const chunk of upstream.body ?? []) { size += chunk.length; if (size > 16000000) throw fail(502, 'Stock asset exceeded the size limit.'); chunks.push(Buffer.from(chunk)); }
    res.end(req.method === 'HEAD' ? undefined : Buffer.concat(chunks));
  };
}

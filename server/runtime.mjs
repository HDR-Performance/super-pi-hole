import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { randomBytes, scryptSync, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReviewStore, createReviewMiddleware } from './review-service.mjs';
import { createPiholeClient, createLiveMiddleware, fail, json, readJson } from './pihole-service.mjs';

const derive = promisify(scrypt);
export function secret(env, name) {
  if (env[name + '_FILE']) return readFileSync(env[name + '_FILE'], 'utf8').trim();
  return env[name] ?? '';
}
export function createRuntime({ publicOrigin, password, dataPath, staticDir, pihole = {}, clock = Date.now, synthetic = false }) {
  const origin = new URL(publicOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw Error('PUBLIC_ORIGIN must be the exact browser HTTP(S) origin, without a path.');
  if (typeof password !== 'string' || password.length < 16 || password.length > 256 || /CHANGE_ME|REPLACE_ME/.test(password)) throw Error('Set a unique SUPER_PIHOLE_PASSWORD of 16-256 characters before starting.');
  const salt = randomBytes(32), expected = scryptSync(password, salt, 64);
  const sessions = new Map(), attempts = new Map();
  let globalAttempts = { start: clock(), count: 0 };
  const store = createReviewStore(dataPath);
  const review = createReviewMiddleware(store, { authorize: () => true });
  const live = createLiveMiddleware(createPiholeClient(pihole));
  const cookieName = 'sph_session', sessionLife = 8 * 60 * 60 * 1000;
  const cookie = (token, maxAge) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.protocol === 'https:' ? '; Secure' : ''}`;
  function tokenFor(req) {
    return (req.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1) ?? '';
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const path = new URL(req.url, origin).pathname;
      if (path === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true, service: 'Super Pi Hole', version: '0.2.0-test' });
      if (req.headers.host !== origin.host || req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origin.origin)) throw fail(403, 'Use the configured Super Pi Hole address. Cross-origin requests are blocked.');
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin.origin) throw fail(403, 'A same-origin request is required.');
      for (const [key, expires] of sessions) if (expires <= clock()) sessions.delete(key);
      const token = tokenFor(req), authenticated = sessions.has(token);
      if (path === '/session-api/status' && req.method === 'GET') return json(res, 200, { authenticated, mode: 'server-test', insecureTransport: origin.protocol === 'http:', synthetic });
      if (path === '/session-api/login' && req.method === 'POST') {
        const address = req.socket.remoteAddress;
        for (const [key, item] of attempts) if (item.until <= clock()) attempts.delete(key);
        if (clock() - globalAttempts.start > 900000) globalAttempts = { start: clock(), count: 0 };
        const attempt = attempts.get(address) ?? { count: 0, until: clock() + 900000 };
        if (attempt.count >= 10 || globalAttempts.count >= 100 || attempts.size >= 1024) throw fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
        attempt.count++; globalAttempts.count++; attempts.set(address, attempt);
        const body = await readJson(req, 4096);
        if (typeof body.password !== 'string' || body.password.length > 256) throw fail(401, 'Incorrect administrator password.');
        const actual = await derive(body.password, salt, 64);
        if (!timingSafeEqual(expected, actual)) throw fail(401, 'Incorrect administrator password.');
        attempts.delete(address);
        if (sessions.size >= 500) throw fail(429, 'Too many active sessions. Restart the app to revoke sessions.');
        const freshToken = randomBytes(32).toString('hex');
        if (token) sessions.delete(token);
        sessions.set(freshToken, clock() + sessionLife);
        res.setHeader('Set-Cookie', cookie(freshToken, sessionLife / 1000));
        return json(res, 200, { authenticated: true, mode: 'server-test', insecureTransport: origin.protocol === 'http:', synthetic });
      }
      if (path === '/session-api/logout' && req.method === 'POST') {
        sessions.delete(token); res.setHeader('Set-Cookie', cookie('', 0));
        return json(res, 200, { authenticated: false });
      }
      if (path.startsWith('/review-api/') || path.startsWith('/live-api/')) {
        if (!authenticated) throw fail(401, 'Sign in to access network information.');
        if (path.startsWith('/review-api/')) return await review(req, res);
        return await live(req, res);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Method not allowed.');
      let relative;
      if (path === '/') relative = 'index.html';
      else if (/^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff|woff2)$/.test(path)) relative = path.slice(1);
      else throw fail(404, 'Not found.');
      const file = resolve(staticDir, relative);
      let stat;
      try { stat = statSync(file); } catch { throw fail(404, 'Not found.'); }
      if (!stat.isFile()) throw fail(404, 'Not found.');
      const extension = relative.split('.').at(-1);
      res.setHeader('Content-Type', { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', woff: 'font/woff', woff2: 'font/woff2' }[extension]);
      res.setHeader('Content-Length', stat.size);
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      if (!res.headersSent) json(res, error.status ?? 500, { error: error.status ? error.message : 'The server could not complete this request.' });
      else res.destroy();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 50;
  server.once('close', () => { sessions.clear(); store.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const server = createRuntime({
    publicOrigin: env.PUBLIC_ORIGIN ?? '', password: secret(env, 'SUPER_PIHOLE_PASSWORD'),
    dataPath: resolve(env.DATA_DIR ?? '.local/server-test', 'review.sqlite'),
    staticDir: resolve(env.STATIC_DIR ?? 'standalone-dist'),
    pihole: { url: env.PIHOLE_URL, password: secret(env, 'PIHOLE_PASSWORD'), writeEnabled: env.PIHOLE_WRITE_ENABLED === 'true' },
  });
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT.');
  server.listen(port, env.HOST ?? '127.0.0.1', () => console.log(`Super Pi Hole 0.2.0-test listening on port ${port}; live writes ${env.PIHOLE_WRITE_ENABLED === 'true' ? 'unlocked' : 'locked'}.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}

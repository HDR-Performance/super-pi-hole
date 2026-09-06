import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import { createPiholeClient, createLiveMiddleware, json } from './pihole-service.mjs';
import { familyDefaults, socialServices } from '../lib/family-dns.mjs';
import {
  createReviewStore,
  createReviewMiddleware,
} from './review-service.mjs';
export function reviewPlugin(): Plugin {
  return {
    name: 'super-pi-hole-local-review',
    configureServer(server) {
      const store = createReviewStore(
        resolve(server.config.root, '.local/review.sqlite'),
      );
      const live = createLiveMiddleware(createPiholeClient({ url: process.env.PIHOLE_URL, password: process.env.PIHOLE_PASSWORD, writeEnabled: false }));
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/live-api/') && !req.url?.startsWith('/session-api/')) return next();
        const host = req.headers.host ?? '';
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Local same-origin access only.' });
        if (req.url === '/session-api/status' && req.method === 'GET') return json(res, 200, { authenticated: true, mode: 'local-review' });
        if (req.url.startsWith('/session-api/')) return json(res, 404, { error: 'No sign-in is needed for the loopback-only review.' });
        if (req.url === '/live-api/family/state' && req.method === 'GET') return json(res, 200, { revision: 0, config: familyDefaults(), status: 'Standalone server required', error: 'Use the authenticated standalone server for durable live family controls. This development server is read-only.', checkedAt: null, blocking: null, writeEnabled: false, busy: false, unread: 0, events: [], daily: [], services: socialServices });
        if (req.url.startsWith('/live-api/family/')) return json(res, 403, { error: 'Family writes require the authenticated standalone server.' });
        void live(req, res, next);
      });
      server.middlewares.use(createReviewMiddleware(store));
      server.httpServer?.once('close', () => store.close());
    },
  };
}

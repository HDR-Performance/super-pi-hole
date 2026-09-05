// Local review service only. No DNS calls, Pi-hole writes, cloud storage, or port 53.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  initialNetwork,
  validateNetwork,
  evaluateNetwork,
} from '../lib/network-policy.ts';

export function createReviewStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version === 0)
    db.exec(
      readFileSync(new URL('./migrations/001.sql', import.meta.url), 'utf8'),
    );
  else if (version !== 1) {
    db.close();
    throw new Error(
      'Unsupported review database version. Preserve this file; migration is required.',
    );
  }
  db.prepare('INSERT OR IGNORE INTO review_settings VALUES(1,0,?,?)').run(
    JSON.stringify(initialNetwork()),
    new Date().toISOString(),
  );
  const get = () => {
    const row = db
      .prepare(
        'SELECT revision,body,updated_at FROM review_settings WHERE id=1',
      )
      .get();
    return {
      revision: row.revision,
      state: JSON.parse(row.body),
      savedAt: row.updated_at,
    };
  };
  const prune = () => {
    const days = get().state.settings.retentionDays;
    if (days === 0) db.prepare('DELETE FROM review_events').run();
    else
      db.prepare('DELETE FROM review_events WHERE created_at < ?').run(
        new Date(Date.now() - days * 86400000).toISOString(),
      );
  };
  const snapshot = () => {
    prune();
    return {
      ...get(),
      events: db
        .prepare(
          'SELECT id,body,created_at,acknowledged FROM review_events ORDER BY id DESC LIMIT 200',
        )
        .all()
        .map((r) => ({
          ...JSON.parse(r.body),
          id: r.id,
          createdAt: r.created_at,
          acknowledged: !!r.acknowledged,
        })),
      canRestore: !!db
        .prepare('SELECT revision FROM review_snapshots LIMIT 1')
        .get(),
    };
  };
  const save = (state, revision) => {
    const valid = validateNetwork(state),
      old = get();
    if (!Number.isInteger(revision) || revision !== old.revision)
      throw Object.assign(
        new Error(
          'Settings changed in another tab. Export your draft, then reload before saving.',
        ),
        { status: 409 },
      );
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db
        .prepare(
          'UPDATE review_settings SET revision=revision+1,body=?,updated_at=? WHERE id=1 AND revision=?',
        )
        .run(JSON.stringify(valid), new Date().toISOString(), revision);
      if (!result.changes)
        throw Object.assign(
          new Error('Settings changed in another tab. Reload before saving.'),
          { status: 409 },
        );
      db.prepare('INSERT INTO review_snapshots VALUES(?,?,?)').run(
        old.revision,
        JSON.stringify(old.state),
        old.savedAt,
      );
      db.prepare(
        'DELETE FROM review_snapshots WHERE revision NOT IN (SELECT revision FROM review_snapshots ORDER BY revision DESC LIMIT 10)',
      ).run();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return snapshot();
  };
  return {
    snapshot,
    save,
    close: () => db.close(),
    test(scenario, revision) {
      const current = get();
      if (revision !== current.revision)
        throw Object.assign(
          new Error('Save or reload settings before testing.'),
          { status: 409 },
        );
      const decision = evaluateNetwork(current.state, scenario);
      const event = {
        scenario,
        decision,
        notification:
          current.state.settings.notifications &&
          decision.source === 'country' &&
          decision.action === 'block',
      };
      if (current.state.settings.retentionDays > 0) {
        db.prepare(
          'INSERT INTO review_events(body,created_at) VALUES(?,?)',
        ).run(JSON.stringify(event), new Date().toISOString());
        db.prepare(
          'DELETE FROM review_events WHERE id NOT IN (SELECT id FROM review_events ORDER BY id DESC LIMIT 200)',
        ).run();
      }
      return { decision, ...snapshot() };
    },
    acknowledge() {
      db.prepare(
        'UPDATE review_events SET acknowledged=1 WHERE acknowledged=0',
      ).run();
      return snapshot();
    },
    restore(revision) {
      const row = db
        .prepare(
          'SELECT body FROM review_snapshots ORDER BY revision DESC LIMIT 1',
        )
        .get();
      if (!row) throw new Error('There is no previous save to restore.');
      return save(JSON.parse(row.body), revision);
    },
  };
}
export function createReviewMiddleware(store, options = {}) {
  return async (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith('/review-api/')) return next?.();
    const reply = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    try {
      const remote = req.socket.remoteAddress,
        host = req.headers.host ?? '';
      if (options.authorize ? !options.authorize(req) : (
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) ||
        !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)
      ))
        return reply(403, {
          error: 'This review service is available only on this computer.',
        });
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${host}` &&
        req.headers.origin !== `https://${host}`
      )
        return reply(403, {
          error: 'Cross-origin review requests are not allowed.',
        });
      if (req.headers['sec-fetch-site'] === 'cross-site')
        return reply(403, {
          error: 'Cross-site review requests are not allowed.',
        });
      if (req.method === 'GET' && path === '/review-api/state')
        return reply(200, store.snapshot());
      if (
        req.method !== 'POST' ||
        req.headers['x-super-pihole-review'] !== '1' ||
        !req.headers['content-type']?.startsWith('application/json')
      )
        return reply(403, {
          error: 'A same-origin JSON review request is required.',
        });
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1048576)
          return reply(413, { error: 'Review request exceeds 1 MiB.' });
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reply(400, { error: 'Invalid JSON.' });
      }
      if (path === '/review-api/save')
        return reply(200, store.save(body.state, body.revision));
      if (path === '/review-api/test')
        return reply(200, store.test(body.scenario, body.revision));
      if (path === '/review-api/acknowledge')
        return reply(200, store.acknowledge());
      if (path === '/review-api/restore')
        return reply(200, store.restore(body.revision));
      return reply(404, { error: 'Unknown review operation.' });
    } catch (error) {
      reply(error.status ?? 400, {
        error: error.message ?? 'Review request failed.',
      });
    }
  };
}

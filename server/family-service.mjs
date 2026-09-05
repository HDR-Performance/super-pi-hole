import { DatabaseSync } from 'node:sqlite';
import {
  familyDefaults,
  validateFamily,
  compileFamily,
  socialServices,
} from '../lib/family-dns.mjs';
import { managedFamilyRules } from './family-engine.mjs';

export function createFamilyService({ path, client, clock = Date.now }) {
  // Separate file: no change to existing review-settings schema or Pi-hole databases.
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(
    'CREATE TABLE IF NOT EXISTS family_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL);',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS family_events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0);',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_family_events_at ON family_events(at);',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS family_daily (day TEXT PRIMARY KEY, changes INTEGER NOT NULL, errors INTEGER NOT NULL);',
  );
  db.prepare('INSERT OR IGNORE INTO family_state VALUES(1,0,?)').run(
    JSON.stringify({
      config: familyDefaults(),
      status: 'idle',
      rules: [],
      checkedAt: null,
      blocking: null,
      error: null,
    }),
  );
  const read = () => {
    const row = db
      .prepare('SELECT revision,body FROM family_state WHERE id=1')
      .get();
    return { revision: row.revision, ...JSON.parse(row.body) };
  };
  const write = (value) => {
    const { revision, ...body } = value;
    db.prepare('UPDATE family_state SET revision=?,body=? WHERE id=1').run(
      revision,
      JSON.stringify(body),
    );
  };
  const prune = () => {
    db.prepare('DELETE FROM family_events WHERE at <= ?').run(
      clock() - read().config.detailDays * 86400000,
    );
    db.prepare('DELETE FROM family_daily WHERE day <= ?').run(
      new Date(clock() - 365 * 86400000).toISOString().slice(0, 10),
    );
  };
  const event = (severity, message) => {
    if (read().config.detailDays > 0)
      db.prepare(
        'INSERT INTO family_events(at,severity,message) VALUES(?,?,?)',
      ).run(clock(), severity, message);
    db.prepare(
      'INSERT INTO family_daily VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET changes=changes+excluded.changes,errors=errors+excluded.errors',
    ).run(
      new Date(clock()).toISOString().slice(0, 10),
      severity === 'info' ? 1 : 0,
      severity === 'error' ? 1 : 0,
    );
    prune();
  };
  if (read().status === 'applying') {
    write({
      ...read(),
      status: 'attention',
      error:
        'The server stopped during a change. Review the engine rules before retrying.',
    });
    event('error', 'Interrupted family update: automatic changes paused.');
  }
  let busy = false,
    closed = false;
  const snapshot = () => {
    prune();
    return {
      ...read(),
      busy,
      services: socialServices,
      ...client.info(),
      events: db
        .prepare('SELECT * FROM family_events ORDER BY id DESC LIMIT 200')
        .all(),
      unread: db
        .prepare('SELECT count(*) AS n FROM family_events WHERE acknowledged=0')
        .get().n,
      daily: db
        .prepare('SELECT * FROM family_daily ORDER BY day DESC LIMIT 366')
        .all(),
    };
  };
  const run = async () => {
    if (closed) return;
    prune();
    const state = read();
    if (
      closed ||
      busy ||
      ['attention', 'applying'].includes(state.status) ||
      (state.status === 'idle' &&
        !state.config.profiles.length &&
        !state.rules.length)
    )
      return;
    busy = true;
    // Persist before the first external write. A crash never implies successful enforcement.
    write({ ...state, status: 'applying' });
    try {
      const result = await client.syncFamily({
        desired: compileFamily(state.config, clock()),
        expected: state.rules,
        groupIds: state.config.profiles.map((p) => p.groupId),
      });
      write({
        ...state,
        status: 'applied',
        rules: result.rules,
        checkedAt: clock(),
        blocking: result.blocking,
        error: null,
      });
      if (result.changes)
        event(
          'info',
          `${result.changes} managed DNS rule changes verified in Pi-hole.`,
        );
      if (result.blocking !== 'enabled' && state.blocking !== result.blocking)
        event(
          'warning',
          'Pi-hole blocking is disabled. Family rules are saved but cannot block DNS while global blocking is off.',
        );
    } catch (e) {
      write({
        ...state,
        status: 'attention',
        checkedAt: clock(),
        error: e.status
          ? e.message
          : 'Family control could not confirm the engine change. Inspect before retrying.',
      });
      event('error', read().error);
    } finally {
      busy = false;
    }
  };
  const stale = (revision) => {
    if (busy || revision !== read().revision)
      throw Object.assign(
        Error(
          'Family settings changed or an update is running. Reload before saving.',
        ),
        { status: 409 },
      );
  };
  return {
    snapshot,
    tick: run,
    async save(body) {
      if (!client.info().writeEnabled)
        throw Object.assign(
          Error('Live DNS changes are locked on this server.'),
          { status: 403 },
        );
      if (body.confirmed !== true)
        throw Object.assign(Error('Confirm the family DNS change first.'), {
          status: 400,
        });
      stale(body.revision);
      const config = validateFamily(body.config),
        current = read();
      if (current.status === 'attention')
        throw Object.assign(
          Error(
            'Resolve the pending engine conflict before saving another policy.',
          ),
          { status: 409 },
        );
      write({
        ...current,
        revision: current.revision + 1,
        config,
        status: 'ready',
      });
      event(
        'info',
        'Family DNS settings saved. Applying to the connected engine.',
      );
      await run();
      return snapshot();
    },
    async retry(body) {
      if (
        !client.info().writeEnabled ||
        body.confirmed !== true ||
        body.acknowledgement !== 'RECONCILE MANAGED RULES'
      )
        throw Object.assign(
          Error(
            'Review the current rules and explicitly confirm reconciliation.',
          ),
          { status: 400 },
        );
      stale(body.revision);
      busy = true;
      try {
        const current = read();
        const rules = managedFamilyRules(
          (await client.read('domains')).domains,
        );
        write({
          ...current,
          revision: current.revision + 1,
          rules,
          status: 'ready',
          error: null,
        });
      } finally {
        busy = false;
      }
      await run();
      return snapshot();
    },
    acknowledge(id) {
      if (!Number.isSafeInteger(id) || id < 1)
        throw Object.assign(Error('Choose a notification.'), { status: 400 });
      db.prepare('UPDATE family_events SET acknowledged=1 WHERE id=?').run(id);
      return snapshot();
    },
    async close() {
      closed = true;
      while (busy) await new Promise((r) => setTimeout(r, 10));
      db.close();
    },
  };
}

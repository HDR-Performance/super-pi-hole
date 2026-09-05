import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import {
  createReviewStore,
  createReviewMiddleware,
} from '../server/review-service.mjs';
const scenario = {
  deviceId: 'printer',
  domain: 'telemetry.example',
  country: 'CN',
  category: 'unknown',
  at: '2026-09-07T18:00:00Z',
  feedMatch: false,
};
test('settings survive an actual SQLite close and reopen', () => {
  const path = join(
    mkdtempSync(join(tmpdir(), 'super-pi-hole-test-')),
    'review.sqlite',
  );
  let store = createReviewStore(path);
  const first = store.snapshot();
  first.state.devices[2].name = 'Persisted test printer';
  const saved = store.save(first.state, 0);
  assert.equal(saved.revision, 1);
  store.close();
  store = createReviewStore(path);
  assert.equal(
    store.snapshot().state.devices[2].name,
    'Persisted test printer',
  );
  store.close();
});
test('stale revisions and invalid settings cannot overwrite a working save', () => {
  const store = createReviewStore(':memory:');
  try {
    const first = store.snapshot();
    store.save(first.state, 0);
    assert.throws(
      () => store.save(first.state, 0),
      (e) => e.status === 409,
    );
    first.state.countries.blocked = ['invalid'];
    assert.throws(() => store.save(first.state, 1));
    assert.equal(store.snapshot().revision, 1);
  } finally {
    store.close();
  }
});
test('restore creates a new revision while preserving the original snapshot', () => {
  const store = createReviewStore(':memory:');
  try {
    const old = store.snapshot();
    old.state.settings.timezone = 'UTC';
    store.save(old.state, 0);
    const restored = store.restore(1);
    assert.equal(restored.revision, 2);
    assert.equal(restored.state.settings.timezone, 'America/Los_Angeles');
    assert.equal(store.restore(2).state.settings.timezone, 'UTC');
  } finally {
    store.close();
  }
});
test('country notifications are generated, acknowledged, and retained', () => {
  const store = createReviewStore(':memory:');
  try {
    const s = store.snapshot();
    s.state.countries.enabled = true;
    s.state.countries.blocked = ['CN'];
    store.save(s.state, 0);
    const result = store.test(scenario, 1);
    assert.equal(result.decision.source, 'country');
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].notification, true);
    assert.equal(result.events[0].acknowledged, false);
    assert.equal(store.acknowledge().events[0].acknowledged, true);
    assert.throws(
      () => store.test(scenario, 0),
      (e) => e.status === 409,
    );
  } finally {
    store.close();
  }
});
test('retention disabled removes synthetic history but still returns a decision', () => {
  const store = createReviewStore(':memory:');
  try {
    store.test(scenario, 0);
    const s = store.snapshot();
    s.state.settings.retentionDays = 0;
    assert.equal(store.save(s.state, 0).events.length, 0);
    const result = store.test(scenario, 1);
    assert.ok(result.decision);
    assert.equal(result.events.length, 0);
  } finally {
    store.close();
  }
});

test('missing parental state and profiles cannot replace a valid configuration', () => {
  const store = createReviewStore(':memory:');
  try {
    const state = store.snapshot().state;
    for (const parental of [
      undefined,
      {},
      { profiles: [] },
      { profiles: null },
    ]) {
      assert.throws(() => store.save({ ...state, parental }, 0));
      assert.equal(store.snapshot().revision, 0);
      assert.ok(store.snapshot().state.parental.profiles.length);
    }
  } finally {
    store.close();
  }
});

test('history stays bounded and country notifications respect the saved preference', () => {
  const store = createReviewStore(':memory:');
  try {
    const state = store.snapshot().state;
    state.settings.notifications = false;
    state.countries.enabled = true;
    state.countries.blocked = ['CN'];
    store.save(state, 0);
    for (let i = 0; i < 205; i++) store.test(scenario, 1);
    const events = store.snapshot().events;
    assert.equal(events.length, 200);
    assert.ok(
      events.every((e) => e.decision.source === 'country' && !e.notification),
    );
  } finally {
    store.close();
  }
});
test('HTTP review API enforces loopback host, same origin, JSON header and revisions', async () => {
  const store = createReviewStore(':memory:'),
    middleware = createReviewMiddleware(store),
    server = createServer((req, res) =>
      middleware(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
    );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let res = await fetch(base + '/review-api/state');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.state.version, 1);
    const hostStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(
        base + '/review-api/state',
        { headers: { Host: 'evil.example:3000' } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(hostStatus, 403);
    res = await fetch(base + '/review-api/state', {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(res.status, 403);
    res = await fetch(base + '/review-api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    assert.equal(res.status, 403);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Super-Pihole-Review': '1',
        Origin: base,
      },
      body: JSON.stringify({ state: data.state, revision: 0 }),
    };
    res = await fetch(base + '/review-api/save', options);
    assert.equal(res.status, 200);
    res = await fetch(base + '/review-api/save', options);
    assert.equal(res.status, 409);
    res = await fetch(base + '/review-api/save', {
      ...options,
      body: 'not json',
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

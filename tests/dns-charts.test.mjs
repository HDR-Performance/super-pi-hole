import test from 'node:test';
import assert from 'node:assert/strict';
import { timeline, clientTimeline, queryWindow } from '../lib/dns-charts.ts';
test('query stacks retain other results without double-counting total', () => {
  const result = timeline([
    { timestamp: 10000, total: 100, cached: 30, blocked: 20, forwarded: 40 },
  ]);
  assert.equal(result.rows[0].other, 10);
  assert.equal(result.omitted, 0);
});
test('invalid counts are omitted, not silently converted into healthy zero traffic', () => {
  assert.equal(
    timeline([{ timestamp: 1, total: 10, cached: 5, blocked: 8, forwarded: 0 }])
      .omitted,
    1,
  );
  assert.equal(
    timeline([
      { timestamp: 1, total: NaN, cached: 0, blocked: 0, forwarded: 0 },
    ]).rows.length,
    0,
  );
  assert.deepEqual(timeline([]).rows, []);
});
test('history window is based on returned timestamps and drill-down does not overlap the next bucket', () => {
  const data = [0, 3600, 7200].map((timestamp) => ({
    timestamp,
    total: 1,
    cached: 1,
    blocked: 0,
    forwarded: 0,
  }));
  assert.deepEqual(
    timeline(data, 1).rows.map((r) => r.timestamp),
    [7200],
  );
  assert.deepEqual(queryWindow(data, 3600), {
    from: '1800',
    until: '5399.999',
  });
  assert.deepEqual(queryWindow(data, 7200), { from: '5400', until: '8999.999' });
  assert.deepEqual(queryWindow([{ timestamp: 300 }], 300), { from: '0', until: '599.999' });
});
test('client chart preserves IPv4 identity, handles sparse zero counts, and keeps other clients separate', () => {
  const result = clientTimeline({
    clients: {
      '192.0.2.20': { name: 'Test printer', total: 5 },
      '0.0.0.0': { name: 'other clients', total: 0 },
    },
    history: [{ timestamp: 100, data: { '192.0.2.20': 5 } }],
  });
  assert.equal(result.clients[0].ip, '192.0.2.20');
  assert.equal(result.rows[0].client0, 5);
  assert.equal(result.rows[0].client1, 0);
});

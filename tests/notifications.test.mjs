import test from 'node:test';
import assert from 'node:assert/strict';
import { createFamilyService } from '../server/family-service.mjs';

test('independent health checks deduplicate, retain active issues after clearing, and report recovery', async () => {
  let result = { blocking: 'disabled', messageCount: 2 };
  const service = createFamilyService({ path: ':memory:', client: {
    info: () => ({ writeEnabled: false }),
    read: async () => result,
  } });
  try {
    await service.checkHealth();
    const ids = service.snapshot().events.map(e => e.id);
    assert.equal(ids.length, 2);
    await service.checkHealth();
    assert.equal(service.snapshot().events.length, 2);
    service.clear(ids);
    assert.equal(service.snapshot().unread, 0);
    assert.equal(service.snapshot().health.issues.length, 2);
    result = { blocking: 'enabled', messageCount: 0 };
    await service.checkHealth();
    assert.equal(service.snapshot().health.issues.length, 0);
    assert.match(service.snapshot().events[0].message, /recovered/);
    service.clear(ids); // a stale browser must not clear a newer event
    assert.equal(service.snapshot().events.length, 1);
    assert.throws(() => service.clear(['1']), /Choose/);
  } finally { await service.close(); }
});

test('authentication and malformed responses become sanitized notifications without policy writes', async () => {
  let failure = true;
  const service = createFamilyService({ path: ':memory:', client: {
    info: () => ({ writeEnabled: false }),
    read: async () => { if (failure) throw Object.assign(Error('secret-password'), { status: 401 }); return {}; },
  } });
  try {
    await service.checkHealth();
    assert.match(service.snapshot().health.issues[0], /authentication/);
    assert.ok(!JSON.stringify(service.snapshot()).includes('secret-password'));
    failure = false;
    await service.checkHealth();
    assert.match(service.snapshot().health.issues[0], /could not be verified/);
  } finally { await service.close(); }
});

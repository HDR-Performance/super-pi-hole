import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordId } from '../lib/record-id.ts';

test('record creation works without secure-context randomUUID', () => {
  const source = { getRandomValues: values => values.fill(255) };
  assert.equal(recordId(source), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(new Set(Array.from({ length: 1000 }, () => recordId())).size, 1000);
});
test('all browser record creation uses the LAN-compatible helper', () => {
  for (const file of ['network-panels', 'activity-panels', 'parental-controls', 'family-dns-controls']) {
    assert.doesNotMatch(readFileSync(new URL(`../components/${file}.tsx`, import.meta.url), 'utf8'), /crypto\.randomUUID\(/);
  }
});

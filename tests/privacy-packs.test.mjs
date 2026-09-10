import test from 'node:test';
import assert from 'node:assert/strict';
import { privacyPackDomains, privacyRuleOwner } from '../lib/privacy-packs.mjs';

test('Windows privacy pack owns the requested settings endpoint', () => {
  assert.deepEqual(privacyPackDomains['windows-telemetry'], [
    'settings-win.data.microsoft.com',
  ]);
  assert.equal(
    privacyRuleOwner('windows-telemetry', 'settings-win.data.microsoft.com'),
    'Super Pi Hole network v1: privacy:windows-telemetry:settings-win.data.microsoft.com',
  );
});

test('privacy pack supplemental domains are exact normalized hostnames', () => {
  for (const domains of Object.values(privacyPackDomains)) {
    for (const domain of domains) {
      assert.match(domain, /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/);
      assert.equal(domain, domain.toLowerCase());
    }
  }
});

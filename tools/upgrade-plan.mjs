import { createPiholeClient } from '../server/pihole-service.mjs';
import { secret } from '../server/runtime.mjs';
if (!process.env.PIHOLE_URL) throw Error('Set PIHOLE_URL to the existing Pi-hole origin. This tool only plans an additive installation.');
const client = createPiholeClient({ url: process.env.PIHOLE_URL, password: secret(process.env, 'PIHOLE_PASSWORD'), writeEnabled: false });
const version = await client.read('version');
const ftl = version.version?.ftl?.local?.version ?? '';
if (!/^v?6[.]/.test(ftl)) throw Error('This planner requires a verified Pi-hole FTL v6 API. No changes were made.');
const overview = await client.read('overview');
if (!overview.data.blocking) throw Error('Blocking state could not be verified. No changes were made.');
console.log(JSON.stringify({
  kind: 'additive-companion-installation-plan', ftlVersion: ftl,
  currentBlockingState: overview.data.blocking.blocking,
  modifiesExistingPihole: false, automatedReplacementSupported: false,
  steps: [
    'Create a private Teleporter backup using the original Pi-hole interface.',
    'Install Super Pi Hole on a separate web port with its own data volume.',
    'Leave PIHOLE_WRITE_ENABLED=false and verify the displayed DNS data.',
    'Verify client attribution, including IPv6, before relying on device labels.',
    'Retain original Pi-hole administration and document rollback.',
  ],
  rollback: 'Stop only the companion. This does not revert live changes you later authorize.',
}, null, 2));

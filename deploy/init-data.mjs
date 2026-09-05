import { statSync, chmodSync, chownSync } from 'node:fs';
// Only this new app's mounted volume root. No recursive ownership changes.
if (!statSync('/data').isDirectory()) throw Error('/data must be the dedicated app volume.');
chmodSync('/data', 0o700);
chownSync('/data', 568, 568);
console.log('Dedicated Super Pi Hole data volume is ready.');

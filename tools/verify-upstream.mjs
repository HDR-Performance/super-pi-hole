import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import lock from '../config/upstream-lock.json' with { type: 'json' };
const cryptoSource = readFileSync(resolve(import.meta.dirname, '../vendor/sources/mbedtls-4.0.0.tar.bz2'));
if (createHash('sha256').update(cryptoSource).digest('hex') !== '2f3a47f7b3a541ddef450e4867eeecb7ce2ef7776093f3a11d6d43ead6bf2827') throw Error('Mbed TLS source checksum mismatch');
const macVendor = readFileSync(resolve(import.meta.dirname, '../vendor/sources/macvendor.db'));
if (createHash('sha256').update(macVendor).digest('hex') !== '07ed21629e7bea992c1c0c84cf413e1e361e70da97d000e0467c54ffdbfa4bda') throw Error('Pi-hole MAC vendor database checksum mismatch');
for (const source of lock.sources) {
  const dir = resolve(import.meta.dirname, '..', 'vendor/pi-hole', source.name);
  const metadata = JSON.parse(readFileSync(resolve(dir, 'SUPER-PI-HOLE-SOURCE.json')));
  if (metadata.commit !== source.commit) throw Error('Source lock mismatch');
  const lines = readFileSync(resolve(dir, 'SUPER-PI-HOLE-SHA256SUMS'), 'utf8').trim().split('\n');
  if (lines.length !== metadata.importedFiles) throw Error('Source file count mismatch');
  for (const line of lines) {
    const hash = line.slice(0, 64), file = line.slice(66);
    if (createHash('sha256').update(readFileSync(resolve(dir, file))).digest('hex') !== hash) throw Error(`Source changed: ${source.name}/${file}`);
  }
  console.log(`Verified ${source.name} ${source.tag}: ${lines.length} source files`);
}

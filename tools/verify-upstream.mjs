import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import lock from '../config/upstream-lock.json' with { type: 'json' };
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

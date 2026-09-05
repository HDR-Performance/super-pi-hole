import { readFileSync, lstatSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
export function verifyBundle(directory) {
  const root = resolve(directory), manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  if (manifest.product !== 'Super Pi Hole' || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('Invalid bundle manifest.');
  const expected = new Set(['manifest.json']);
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || isAbsolute(entry.path) || entry.path.includes('\\') || entry.path.split('/').some(p => p === '..' || p === '.' || !p) || expected.has(entry.path)) throw Error('Unsafe or duplicate manifest path.');
    const file = resolve(root, entry.path);
    if (!file.startsWith(root + sep)) throw Error('Manifest path escapes the bundle.');
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Bundle contains a non-file entry.');
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (hash !== entry.sha256 || stat.size !== entry.size) throw Error(`Bundle verification failed: ${entry.path}`);
    expected.add(entry.path);
  }
  const walk = (dir, prefix = '') => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix + e.name;
      if (e.isSymbolicLink()) throw Error('Bundle contains a symbolic link.');
      if (e.isDirectory()) walk(join(dir, e.name), relative + '/');
      else if (!expected.has(relative)) throw Error(`Unexpected bundle file: ${relative}`);
    }
  };
  walk(root);
  for (const required of ['server/runtime.mjs', 'server/review-service.mjs', 'server/pihole-service.mjs', 'standalone-dist/index.html', 'deploy/truenas.yaml']) if (!expected.has(required)) throw Error(`Incomplete bundle: ${required}`);
  return { version: manifest.version, files: manifest.files.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(verifyBundle(process.argv[2] ?? '.'), null, 2));

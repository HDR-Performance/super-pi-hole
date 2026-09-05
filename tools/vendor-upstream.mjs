// Maintainer-only import. Runtime installation never runs this script.
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import lock from '../config/upstream-lock.json' with { type: 'json' };

const root = resolve(import.meta.dirname, '..');
const run = (args, cwd) => {
  const out = spawnSync('git', ['-c', 'http.sslBackend=openssl', ...args], { cwd, encoding: 'utf8', timeout: 300000, maxBuffer: 16000000 });
  if (out.status !== 0) throw Error(out.stderr || out.error?.message || 'Git failed');
  return out.stdout.trim();
};
for (const source of lock.sources) {
  const destination = resolve(root, 'vendor', 'pi-hole', source.name);
  if (existsSync(destination)) { console.log(`Preserving existing ${source.name}; use a separately reviewed import to update it.`); continue; }
  const checkout = resolve(root, 'work', 'upstream', source.name);
  mkdirSync(dirname(checkout), { recursive: true });
  if (!existsSync(checkout)) run(['clone', '--depth', '1', '--branch', source.tag, source.repository, checkout], root);
  if (run(['rev-parse', 'HEAD'], checkout) !== source.commit) throw Error(`Commit mismatch: ${source.name}`);
  const files = run(['ls-files', '-z'], checkout).split('\0').filter(Boolean);
  const manifest = [];
  for (const file of files) {
    const from = resolve(checkout, file), to = resolve(destination, file);
    if (isAbsolute(relative(destination, to)) || relative(destination, to).startsWith('..')) throw Error('Unsafe source path');
    const stat = lstatSync(from);
    if (!stat.isFile()) throw Error(`Review non-file source before importing: ${source.name}/${file}`);
    mkdirSync(dirname(to), { recursive: true });
    // Read Git objects, not a Windows checkout with converted CRLF endings.
    const blob = spawnSync('git', ['show', `HEAD:${file}`], { cwd: checkout, maxBuffer: 32000000 });
    if (blob.status !== 0) throw Error(`Cannot read source blob: ${file}`);
    writeFileSync(to, blob.stdout);
    manifest.push(`${createHash('sha256').update(readFileSync(to)).digest('hex')}  ${file}`);
  }
  writeFileSync(resolve(destination, 'SUPER-PI-HOLE-SOURCE.json'), JSON.stringify({ ...source, importedFiles: files.length, license: 'See original LICENSE in this directory', modified: false }, null, 2) + '\n');
  writeFileSync(resolve(destination, 'SUPER-PI-HOLE-SHA256SUMS'), manifest.join('\n') + '\n');
  console.log(`Imported ${source.name} ${source.tag}: ${files.length} original files.`);
}

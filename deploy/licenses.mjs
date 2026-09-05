import { readFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function collectLicenses(destination, root = process.cwd()) {
  const packages = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages;
  let count = 0;
  for (const path of Object.keys(packages)) {
    if (!path.startsWith('node_modules/') || path.includes('..')) continue;
    const directory = join(root, path);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^(licen[cs]e|copying|notice)(?:$|[.\- ])/i.test(entry.name)) continue;
      const target = join(destination, path.replaceAll('node_modules/', ''), entry.name);
      mkdirSync(resolve(target, '..'), { recursive: true });
      copyFileSync(join(directory, entry.name), target); count++;
    }
  }
  if (!count) throw Error('Dependency license files were not found; run npm ci before packaging.');
  return count;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Included ${collectLicenses(resolve(process.argv[2] ?? 'third-party-licenses'))} dependency notices.`);

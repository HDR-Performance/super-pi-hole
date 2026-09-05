import { mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { collectLicenses } from './licenses.mjs';
import { verifyBundle } from './verify-bundle.mjs';
const root = resolve('.'), version = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (!/^[a-z0-9.\-]+$/i.test(version)) throw Error('Unsafe package version.');
if (!existsSync('standalone-dist/index.html')) throw Error('Run npm run build:server first.');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const target = resolve('release', `super-pi-hole-${version}-${stamp}`);
if (existsSync(target)) throw Error('This release path already exists. Existing artifacts are never overwritten.');
mkdirSync(target, { recursive: true });
// Explicit allowlist: no home database, browser data, .env, personal docs, or source credentials.
const paths = [
  'standalone-dist', 'server/runtime.mjs', 'server/review-service.mjs', 'server/pihole-service.mjs', 'server/stock-interface.mjs', 'server/migrations',
  'lib/network-policy.ts', 'lib/parental-policy.ts', 'lib/countries.ts',
  'config/blocklist-presets.json',
  'deploy/truenas.yaml', 'deploy/init-data.mjs', 'deploy/healthcheck.mjs', 'deploy/verify-bundle.mjs',
  'tools/upgrade-plan.mjs', 'README.md', 'DEPLOYMENT.md', 'UPGRADING.md', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md', 'LICENSE', 'vendor-notices',
];
for (const path of paths) { mkdirSync(dirname(join(target, path)), { recursive: true }); cpSync(join(root, path), join(target, path), { recursive: true, errorOnExist: true, force: false }); }
collectLicenses(join(target, 'third-party-licenses'), root);
const files = [];
const walk = (dir, prefix = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = prefix + entry.name, full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, path + '/');
    else files.push({ path, size: statSync(full).size, sha256: createHash('sha256').update(readFileSync(full)).digest('hex') });
  }
};
walk(target);
writeFileSync(join(target, 'manifest.json'), JSON.stringify({ product: 'Super Pi Hole', version, createdAt: new Date().toISOString(), files }, null, 2));
const verified = verifyBundle(target);
const archive = target + '.tar.gz';
const result = spawnSync('tar', ['-czf', archive, '-C', dirname(target), basename(target)], { stdio: 'inherit' });
if (result.status !== 0) throw Error('Bundle directory is ready but tar archive creation failed.');
console.log(JSON.stringify({ directory: target, archive, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), ...verified }, null, 2));

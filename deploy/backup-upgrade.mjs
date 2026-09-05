import { mkdirSync, readdirSync, lstatSync, writeFileSync, cpSync, existsSync, chownSync, chmodSync, openSync, readSync, closeSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

function fileHash(path) {
  const hash = createHash('sha256'), buffer = Buffer.alloc(1048576), fd = openSync(path, 'r');
  try { let count; while ((count = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count)); } finally { closeSync(fd); }
  return hash.digest('hex');
}
export function backupUpgrade({ config, dnsmasq, destination, version = '0.3.0-test' }) {
  for (const dir of [config, dnsmasq]) if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw Error('Pi-hole source must be an existing real directory.');
  for (const file of ['pihole.toml', 'gravity.db']) if (!existsSync(join(config, file))) throw Error(`Missing ${file}: refusing an empty or unsupported migration.`);
  for (const source of [config, dnsmasq]) { const rel = relative(resolve(source), resolve(destination)); if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw Error('Backup must be outside source data.'); }
  const hashes = [];
  function inventory(dir, prefix) {
    for (const item of readdirSync(dir)) {
      const path = join(dir, item), stat = lstatSync(path), name = `${prefix}/${item}`;
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw Error(`Review unsupported source entry before upgrading: ${name}`);
      if (stat.isDirectory()) inventory(path, name);
      else hashes.push({ path: name, bytes: stat.size, sha256: fileHash(path) });
    }
  }
  inventory(config, 'config'); inventory(dnsmasq, 'dnsmasq');
  const target = join(destination, `before-${version}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  cpSync(config, join(target, 'config'), { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
  cpSync(dnsmasq, join(target, 'dnsmasq'), { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
  for (const file of hashes) if (fileHash(join(target, file.path)) !== file.sha256) throw Error('Backup verification failed; do not start DNS.');
  writeFileSync(join(target, 'manifest.json'), JSON.stringify({ version, createdAt: new Date().toISOString(), files: hashes }, null, 2), { mode: 0o600, flag: 'wx' });
  return { target, files: hashes.length };
}
async function requireFreeDnsPort() {
  for (const protocol of ['tcp', 'udp']) await new Promise((resolve, reject) => {
    const socket = protocol === 'udp' ? createSocket('udp4') : createServer();
    socket.once('error', () => { try { socket.close(); } catch {} reject(Error('DNS port 53 is occupied. Stop the original DNS app before upgrading.')); });
    const ready = () => socket.close(resolve);
    if (protocol === 'udp') socket.bind(53, '0.0.0.0', ready);
    else socket.listen(53, '0.0.0.0', ready);
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const password = process.env.SUPER_PIHOLE_PASSWORD ?? '';
  if (password.length < 16 || password.length > 256 || /CHANGE_ME|REPLACE_ME/.test(password)) throw Error('Set a unique Super Pi Hole password before upgrading. Nothing was changed.');
  await requireFreeDnsPort();
  const result = backupUpgrade({ config: '/source/config', dnsmasq: '/source/dnsmasq', destination: '/backups' });
  mkdirSync('/data', { recursive: true });
  chownSync('/data', 568, 568); chmodSync('/data', 0o700);
  console.log(`Verified pre-upgrade backup: ${result.target} (${result.files} files). Source data was read-only.`);
}

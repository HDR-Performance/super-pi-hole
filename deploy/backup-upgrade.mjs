import { mkdirSync, readdirSync, lstatSync, readFileSync, writeFileSync, cpSync, existsSync, chownSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

export function backupUpgrade({ config, dnsmasq, destination, version = '0.3.0-test' }) {
  for (const dir of [config, dnsmasq]) if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw Error('Pi-hole source must be an existing real directory.');
  for (const file of ['pihole.toml', 'gravity.db']) if (!existsSync(join(config, file))) throw Error(`Missing ${file}: refusing an empty or unsupported migration.`);
  for (const source of [config, dnsmasq]) if (resolve(destination).startsWith(resolve(source) + '/')) throw Error('Backup must be outside source data.');
  const hashes = [];
  function inventory(dir, prefix) {
    for (const item of readdirSync(dir)) {
      const path = join(dir, item), stat = lstatSync(path), name = `${prefix}/${item}`;
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw Error(`Review unsupported source entry before upgrading: ${name}`);
      if (stat.isDirectory()) inventory(path, name);
      else hashes.push({ path: name, bytes: stat.size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
    }
  }
  inventory(config, 'config'); inventory(dnsmasq, 'dnsmasq');
  const target = join(destination, `before-${version}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  cpSync(config, join(target, 'config'), { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
  cpSync(dnsmasq, join(target, 'dnsmasq'), { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
  for (const file of hashes) if (createHash('sha256').update(readFileSync(join(target, file.path))).digest('hex') !== file.sha256) throw Error('Backup verification failed; do not start DNS.');
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
  await requireFreeDnsPort();
  const result = backupUpgrade({ config: '/source/config', dnsmasq: '/source/dnsmasq', destination: '/backups' });
  mkdirSync('/data', { recursive: true });
  chownSync('/data', 568, 568); chmodSync('/data', 0o700);
  console.log(`Verified pre-upgrade backup: ${result.target} (${result.files} files). Source data was read-only.`);
}

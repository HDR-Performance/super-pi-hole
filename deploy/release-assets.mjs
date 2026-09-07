import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { load } from 'js-yaml';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+-test$/.test(version)) throw Error('Expected an explicit test version.');
const digest = readFileSync('image-digest.txt', 'utf8').trim();
if (!/^ghcr\.io\/hdr-performance\/super-pi-hole@sha256:[a-f0-9]{64}$/.test(digest)) throw Error('Invalid image digest.');
const image = 'ghcr.io/hdr-performance/super-pi-hole:' + version;
const assets = [
  ['deploy/truenas-fresh-all-in-one.yaml', 'super-pi-hole-truenas-fresh.yaml'],
  ['deploy/truenas-upgrade.yaml', 'super-pi-hole-truenas-upgrade.yaml'],
  ['deploy/truenas-existing-app.yaml', 'super-pi-hole-existing-app-upgrade.yaml'],
];
for (const [source, target] of assets) {
  const template = readFileSync(source, 'utf8');
  const templateConfig = load(template);
  const templateServices = Object.values(templateConfig.services ?? {});
  if (templateServices.length === 0 || templateServices.some(service => service.image !== image)) {
    throw Error('Expected every service to use the version-pinned image in ' + source);
  }
  const rendered = template.replaceAll(image, digest), config = load(rendered);
  if (Object.values(config.services).some(service => service.image !== digest)) throw Error('Mixed image digests.');
  if (config['x-portals'][0].port !== 20721 || config['x-portals'][0].path !== '/') throw Error('Invalid main UI portal.');
  writeFileSync(target, rendered, { flag: 'wx' });
}
const files = [...assets.map(([, target]) => target), 'image-digest.txt', 'branding/icon.png', 'branding/icon.svg'];
writeFileSync('SHA256SUMS.txt', files.map(file => createHash('sha256').update(readFileSync(file)).digest('hex') + '  ' + file + '\n').join(''), { flag: 'wx' });

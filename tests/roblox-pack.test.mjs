import test from 'node:test';
import assert from 'node:assert/strict';
import { socialServices, suffixPattern } from '../lib/family-dns.mjs';
test('Roblox switch covers observed service endpoints without shared CDN bans', () => {
  const pack = socialServices.find(s => s.id === 'roblox');
  assert.ok(pack);
  const regex = new RegExp(suffixPattern(pack.domains));
  for (const host of ['gamejoin.roblox.com', 'assetdelivery.roblox.com', 'voice.roblox.com', 'presence.roblox.com', 'catalog.roblox.com', 'setup.rbxcdn.com', 'roblox.qq.com']) assert.ok(regex.test(host), host);
  for (const host of ['example.com', 'discord.com', 'cloudfront.net', 'akamai.net', 'notroblox.com']) assert.equal(regex.test(host), false, host);
});

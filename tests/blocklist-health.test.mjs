import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectListUrl, inspectListContent } from '../lib/blocklist-health.ts';

test('GitHub HTML page is rejected with a reviewable raw suggestion', () => {
  const result = inspectListUrl(
    'https://github.com/owner/repo/blob/main/list.txt',
  );
  assert.equal(result.accepted, false);
  assert.equal(
    result.suggestedRawUrl,
    'https://raw.githubusercontent.com/owner/repo/main/list.txt',
  );
});
test('credentials, HTTP and malformed URLs are rejected', () => {
  for (const url of [
    'http://example.com/list',
    'https://user:secret@example.com/list',
    'not a url',
    'https://example.com/list#content',
  ])
    assert.equal(inspectListUrl(url).accepted, false);
});
test('HTML is rejected even when served with status 200 and text/plain', () => {
  assert.equal(
    inspectListContent('<!DOCTYPE html><html>ad.example</html>', 'text/plain')
      .accepted,
    false,
  );
  assert.equal(inspectListContent('ad.example', 'text/html').accepted, false);
});
test('domains, hosts and DNS-compatible ABP are recognized and deduplicated', () => {
  const result = inspectListContent(
    '# comment\n0.0.0.0 ads.example track.example\n||bad.example^\nads.example\n',
  );
  assert.equal(result.accepted, true);
  assert.equal(result.ruleCount, 3);
  assert.equal(result.duplicates, 1);
});
test('unsupported browser rules cannot be silently converted', () => {
  const result = inspectListContent(
    'ads.example\n||other.example^$script\nexample.com##.ad\n@@||allowed.example^\n',
  );
  assert.equal(result.accepted, false);
  assert.equal(result.invalidLines, 3);
});
test('hosts banner comments are ignored without converting inline cosmetic rules', () => {
  const result = inspectListContent(
    '################\n### Hosts list ###\n! Comment ## banner\nads.example # comment\n',
  );
  assert.equal(result.accepted, true);
  assert.equal(result.ruleCount, 1);
  assert.equal(result.invalidLines, 0);
  assert.equal(inspectListContent('example.com##.advertisement').ruleCount, 0);
});
test('empty responses and large rule-count drops require review', () => {
  assert.equal(inspectListContent('# empty').accepted, false);
  assert.equal(
    inspectListContent('one.example', 'text/plain', 100).accepted,
    false,
  );
});
test('proposed presets reference valid unique sources and one base family', () => {
  const config = JSON.parse(
    readFileSync(
      new URL('../config/blocklist-presets.json', import.meta.url),
      'utf8',
    ),
  );
  const ids = new Set(config.sources.map((s) => s.id));
  assert.equal(ids.size, config.sources.length);
  assert.ok(config.presets.some((p) => p.id === config.defaultPreset));
  for (const p of config.presets) {
    assert.equal(new Set(p.sources).size, p.sources.length);
    for (const id of p.sources) assert.ok(ids.has(id));
    assert.ok(
      p.sources.filter(
        (id) =>
          config.sources.find((s) => s.id === id).exclusiveFamily === 'base',
      ).length <= 1,
    );
  }
  for (const source of config.sources)
    assert.equal(inspectListUrl(source.url).accepted, true);
});
test('Balanced allows social platforms by default and keeps threat protection separate from optional restrictions', () => {
  const config = JSON.parse(readFileSync(new URL('../config/blocklist-presets.json', import.meta.url), 'utf8'));
  const baseline = config.presets.find(p => p.id === config.defaultPreset);
  assert.deepEqual(baseline.sources, ['hagezi-normal', 'hagezi-tif-medium']);
  for (const source of config.sources.filter(s => ['social', 'adult-content', 'gambling', 'windows-telemetry', 'lg-telemetry'].includes(s.exclusiveFamily))) assert.ok(!baseline.sources.includes(source.id));
  assert.match(baseline.note, /YouTube and social media available/);
  assert.match(baseline.note, /No list catches every threat/);
});
test('Windows and LG privacy packs are opt-in and never part of the default preset', () => {
  const config = JSON.parse(readFileSync(new URL('../config/blocklist-presets.json', import.meta.url), 'utf8'));
  const baseline = config.presets.find(p => p.id === config.defaultPreset);
  for (const id of ['hagezi-windows', 'hagezi-lg']) {
    assert.ok(config.sources.some(s => s.id === id));
    assert.ok(!baseline.sources.includes(id));
    assert.match(config.presets.find(p => p.sources.includes(id)).note, /Off by default/);
  }
});
test('2026 aggressive tiers are explicit opt-ins and use one mutually exclusive base list', () => {
  const config = JSON.parse(readFileSync(new URL('../config/blocklist-presets.json', import.meta.url), 'utf8'));
  const aggressive = config.presets.find(p => p.id === 'aggressive');
  const maximum = config.presets.find(p => p.id === 'maximum');
  assert.deepEqual(aggressive.sources, ['hagezi-pro-plus', 'hagezi-tif-medium']);
  assert.deepEqual(maximum.sources, ['hagezi-ultimate', 'hagezi-tif-medium']);
  assert.match(aggressive.note, /Does not reliably remove YouTube in-stream ads/);
  assert.match(maximum.note, /Highest-breakage/);
  assert.equal(config.defaultPreset, 'balanced');
});

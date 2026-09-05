import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { createPiholeClient } from '../server/pihole-service.mjs';
import { createStockInterface } from '../server/stock-interface.mjs';

const specs = new URL(
  '../vendor/pi-hole/ftl/src/api/docs/content/specs/',
  import.meta.url,
);
test('parity endpoints and methods exist in the bundled FTL OpenAPI reference', () => {
  const api = load(readFileSync(new URL('main.yaml', specs), 'utf8'));
  for (const [path, method] of [
    ['/config', 'patch'],
    ['/dns/blocking', 'post'],
    ['/stats/database/summary', 'get'],
    ['/history/database', 'get'],
    ['/history/database/clients', 'get'],
    ['/queries', 'get'],
    ['/domains/{type}/{kind}/{domain}', 'put'],
    ['/clients/{client}', 'delete'],
    ['/action/restartdns', 'post'],
    ['/action/flush/logs', 'post'],
    ['/action/flush/network', 'post'],
    ['/action/flush/arp', 'post'],
  ]) {
    const ref = api.paths[path]?.$ref;
    assert.ok(ref, `Pinned engine must document ${path}`);
    const [file, pointer] = ref.split('#');
    let operation = load(readFileSync(new URL(file, specs), 'utf8'));
    for (const key of pointer.split('/').filter(Boolean))
      operation = operation[key];
    assert.ok(
      operation[method],
      `Pinned engine must support ${method} ${path}`,
    );
  }
});

test('stock page authentication stays server-side and invalid page targets are rejected', async () => {
  const calls = [];
  const client = createPiholeClient({
    url: 'http://127.0.0.1:20720',
    controlled: true,
    password: 'fixture-only-engine-password',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), ...init });
      if (url.pathname === '/api/auth')
        return Response.json({
          session: {
            valid: true,
            sid: 'fixture-private-engine-sid',
            validity: 300,
          },
        });
      assert.equal(init.headers['X-FTL-SID'], 'fixture-private-engine-sid');
        return new Response('<meta name="csrf-token" content="fixture-private-csrf"><h1>Original dashboard</h1>', {
        headers: { 'content-type': 'text/html' },
      });
    },
  });
  const headers = {},
    result = {
      setHeader(k, v) {
        headers[k] = v;
      },
      end(value) {
        this.body = value;
      },
    };
  const stock = createStockInterface(client, {
    enabled: true,
    url: 'http://127.0.0.1:20720',
  });
  await stock(
    { method: 'GET', url: '/admin/?sid=browser-supplied-value' },
    result,
  );
  assert.match(result.body.toString(), /Original dashboard/);
  assert.doesNotMatch(
    JSON.stringify(headers) + result.body.toString(),
    /fixture-private-engine-sid|fixture-private-csrf|browser-supplied-value/,
  );
  assert.equal(new URL(calls[1].url).searchParams.has('sid'), false);
  for (const path of [
    'https://evil.example/admin/',
    '/admin/../api/config',
    '/admin/%2e%2e/api/config',
    '/api/config',
  ])
    await assert.rejects(client.stockPage(path), { status: 403 });
});

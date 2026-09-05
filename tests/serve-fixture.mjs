import { resolve } from 'node:path';
import { createRuntime } from '../server/runtime.mjs';
import { fixtureFetch } from './fixtures/pihole-fixture.mjs';
const api = fixtureFetch();
const server = createRuntime({ synthetic: true, publicOrigin: 'http://127.0.0.1:3100', password: 'local-fixture-only-password', dataPath: resolve('.local/fixture/review.sqlite'), staticDir: resolve('standalone-dist'), pihole: { url: 'http://fixture.example', writeEnabled: true, fetchImpl: api.request } });
server.listen(3100, '127.0.0.1', () => console.log('Synthetic-only GUI test: http://127.0.0.1:3100'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));

import { resolve } from 'node:path';
import { createRuntime } from '../server/runtime.mjs';
import { fixtureFetch } from './fixtures/pihole-fixture.mjs';
const api = fixtureFetch();
const port = Number(process.argv[2] ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid fixture port');
const server = createRuntime({ synthetic: true, publicOrigin: `http://127.0.0.1:${port}`, password: 'local-fixture-only-password', dataPath: resolve(`.local/fixture-${port}/review.sqlite`), staticDir: resolve('standalone-dist'), pihole: { url: 'http://fixture.example', writeEnabled: true, fetchImpl: api.request } });
server.listen(port, '127.0.0.1', () => console.log(`Synthetic-only GUI test: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));

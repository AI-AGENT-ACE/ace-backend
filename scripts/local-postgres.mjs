import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

if (process.env.NODE_ENV === 'production') throw new Error('Local PostgreSQL is development-only.');
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Local host required.');
const directory = resolve('.local/postgres');
const postgres = new EmbeddedPostgres({
  databaseDir: directory,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || '55432'),
  persistent: true,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: [
    '-h',
    '127.0.0.1',
    '-c',
    'log_statement=none',
    '-c',
    'log_min_error_statement=panic',
  ],
  onLog: () => {},
  onError: () => {},
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await postgres.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  if (!existsSync(resolve(directory, 'PG_VERSION'))) await postgres.initialise();
  await postgres.start();
  const client = postgres.getPgClient();
  await client.connect();
  for (const name of [
    url.pathname.slice(1),
    new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1),
  ]) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid development database name.');
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (result.rowCount === 0) await postgres.createDatabase(name);
  }
  await client.end();
  console.log(
    `Development PostgreSQL ready on 127.0.0.1:${url.port}. Ctrl+C stops it; data persists in .local/.`,
  );
  setInterval(() => {}, 60_000);
} catch {
  console.error('Local PostgreSQL could not start. Check the selected port and .env credentials.');
  await postgres.stop().catch(() => {});
  process.exitCode = 1;
}

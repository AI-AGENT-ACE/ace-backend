// Isolated chat regression: fake AI + fresh PostgreSQL. Never uses .env or remote services.
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repository, 'package.json'));
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(require.resolve('embedded-postgres')).href
);
const { Client } = require('pg');
mkdirSync(join(repository, '.local'), { recursive: true });
const scratch = mkdtempSync(join(repository, '.local/modal-smoke-'));
let remote;
async function port() {
  const server = createServer();
  await new Promise((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  const selected = server.address().port;
  await new Promise((done) => server.close(done));
  return selected;
}
const dbPort = await port(),
  appPort = await port();
let slowStarted = false,
  upstreamAborted = false;
const ai = createHttpServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/conversations') return res.end(JSON.stringify({ conversationId: 'fake-chat' }));
  const data = JSON.parse(body);
  if (data.message === 'cancel this') {
    slowStarted = true;
    res.on('close', () => {
      upstreamAborted = !res.writableEnded;
    });
    return;
  }
  res.end(
    JSON.stringify({
      conversationId: 'fake-chat',
      title: 'AI가 만든 제목',
      response: { type: 'message', content: '정상 답변입니다.' },
    }),
  );
});
await new Promise((done) => ai.listen(0, '127.0.0.1', done));
remote = 'http://127.0.0.1:' + ai.address().port;
const password = randomBytes(24).toString('hex');
const databaseUrl = `postgresql://modal_smoke:${password}@127.0.0.1:${dbPort}/modal_smoke_test?schema=public`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: String(appPort),
  DATABASE_URL: databaseUrl,
  DOTENV_CONFIG_PATH: join(scratch, 'nonexistent.env'),
  JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  AI_SERVER_URL: remote,
  AI_SERVER_API_KEY: '',
  AI_REQUEST_TIMEOUT_MS: '120000',
  VOICE_PROCESSING_TIMEOUT_MS: '120000',
  SWAGGER_ENABLED: 'false',
  TRASH_CLEANUP_ENABLED: 'false',
  UPLOAD_DIR: join(scratch, 'uploads'),
  VOICE_TEMP_DIR: join(scratch, 'voice'),
};
const postgres = new EmbeddedPostgres({
  databaseDir: join(scratch, 'postgres'),
  user: 'modal_smoke',
  password,
  port: dbPort,
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
  onLog() {},
  onError() {},
});
let application,
  db,
  failed = false;
async function start() {
  application = spawn(process.execPath, [join(repository, 'dist/main.js')], {
    cwd: scratch,
    env,
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let i = 0; i < 120; i++) {
    if (application.exitCode !== null) throw Error('Backend exited before readiness');
    try {
      if ((await fetch(`http://127.0.0.1:${appPort}/health/live`)).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 250));
  }
  throw Error('Backend startup timeout');
}
async function stop() {
  if (application && application.exitCode === null) {
    const done = new Promise((r) => application.once('exit', r));
    application.kill();
    await done;
  }
}
async function request(path, body, token) {
  const response = await fetch(`http://127.0.0.1:${appPort}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(150000),
  });
  if (!response.ok) {
    let code = 'unknown';
    try {
      code = (await response.json()).code ?? code;
    } catch {}
    throw Error(`${path}: HTTP ${response.status} (${code})`);
  }
  return response;
}
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('modal_smoke_test');
  try {
    await promisify(execFile)(
      process.execPath,
      [
        join(repository, 'node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
        '--config',
        join(repository, 'prisma.config.ts'),
      ],
      { cwd: scratch, env, timeout: 90000, windowsHide: true },
    );
  } catch {
    throw Error('Isolated migration failed (connection output withheld)');
  }
  db = new Client({ connectionString: databaseUrl });
  await db.connect();
  const migrations = (
    await db.query(
      'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    )
  ).rows[0].count;
  assert.equal(migrations, 6);
  console.log('PASS: six migrations on fresh isolated PostgreSQL');
  await start();
  const email = 'chat-' + randomUUID() + '@example.test',
    loginPassword = 'Test!' + randomBytes(16).toString('hex');
  await request('/auth/register', { email, password: loginPassword });
  const { accessToken } = await (
    await request('/auth/login', { email, password: loginPassword })
  ).json();
  const conversation = await (await request('/conversations', {}, accessToken)).json();
  const saved = await (
    await request(
      '/conversations/' + conversation.id + '/messages',
      { content: 'cancel this' },
      accessToken,
    )
  ).json();
  const title = await (
    await request('/conversations/' + conversation.id, undefined, accessToken)
  ).json();
  assert.equal(title.title, 'cancel this');
  const abort = new AbortController();
  const cancelled = fetch('http://127.0.0.1:' + appPort + '/agent/turns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({
      conversationId: conversation.id,
      content: saved.content,
      messageId: saved.id,
    }),
    signal: abort.signal,
  }).catch((error) => error);
  for (let i = 0; i < 100 && !slowStarted; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(slowStarted, 'upstream request started');
  abort.abort();
  await cancelled;
  for (let i = 0; i < 100 && !upstreamAborted; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(upstreamAborted, 'backend abort reached upstream connection');
  const page = await (
    await request('/conversations/' + conversation.id + '/messages', undefined, accessToken)
  ).json();
  assert.deepEqual(
    page.items.map((m) => m.role),
    ['USER'],
  );
  console.log(
    'PASS: HTTP cancellation preserves user bubble, aborts AI, and stores no assistant response',
  );
  const next = await (
    await request(
      '/conversations/' + conversation.id + '/messages',
      { content: 'next request' },
      accessToken,
    )
  ).json();
  const turn = await (
    await request(
      '/agent/turns',
      { conversationId: conversation.id, content: next.content, messageId: next.id },
      accessToken,
    )
  ).json();
  assert.ok(turn.message.content);
  let row = (
    await db.query('SELECT title,"titleSource" FROM "Conversation" WHERE id=$1', [conversation.id])
  ).rows[0];
  assert.deepEqual(row, { title: 'AI가 만든 제목', titleSource: 'AI' });
  const patched = await fetch('http://127.0.0.1:' + appPort + '/conversations/' + conversation.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({ title: '내 제목' }),
  });
  assert.ok(patched.ok);
  await request(
    '/agent/turns',
    { conversationId: conversation.id, content: 'third request' },
    accessToken,
  );
  row = (
    await db.query('SELECT title,"titleSource" FROM "Conversation" WHERE id=$1', [conversation.id])
  ).rows[0];
  assert.deepEqual(row, { title: '내 제목', titleSource: 'CUSTOM' });
  const counts = (
    await db.query(
      'SELECT role,count(*)::int AS count FROM "Message" WHERE "conversationId"=$1 GROUP BY role',
      [conversation.id],
    )
  ).rows;
  assert.equal(counts.find((row) => row.role === 'USER').count, 3);
  assert.equal(counts.find((row) => row.role === 'ASSISTANT').count, 2);
  console.log(
    'PASS: next turn succeeds without duplicate user messages; AI title replaces temporary title; manual title retained',
  );
} catch (error) {
  console.error('FAIL:', error.message.replaceAll(password, '[redacted]'));
  failed = true;
} finally {
  await stop();
  if (db) await db.end();
  await postgres.stop().catch(() => {});
  ai.closeAllConnections();
  await new Promise((done) => ai.close(done));
}
if (failed) process.exitCode = 1;

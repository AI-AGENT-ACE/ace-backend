// Opt-in live AI smoke test. Uses a fresh isolated local database, never .env/Neon.
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
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
const remote = 'https://seogjiwon149--ace-ai-fastapi-app.modal.run';
async function port() {
  const server = createServer();
  await new Promise((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  const selected = server.address().port;
  await new Promise((done) => server.close(done));
  return selected;
}
const dbPort = await port(),
  appPort = await port();
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
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
      )
    ).rows[0].count,
    6,
  );
  console.log('PASS: six migrations on fresh isolated PostgreSQL');
  await start();
  const email = `modal-${randomUUID()}@example.test`,
    loginPassword = `Test!${randomBytes(16).toString('hex')}`;
  await request('/auth/register', { email, password: loginPassword });
  const { accessToken } = await (
    await request('/auth/login', { email, password: loginPassword })
  ).json();
  const conversation = await (
    await request('/conversations', { title: 'Modal integration smoke' }, accessToken)
  ).json();
  const turn = await (
    await request(
      '/agent/turns',
      {
        conversationId: conversation.id,
        content: '안녕하세요. 연결 테스트입니다. 짧게 인사해 주세요.',
      },
      accessToken,
    )
  ).json();
  assert.ok(turn.message?.content);
  assert.equal(turn.toolCalls.length, 0);
  console.log('PASS: authenticated backend -> live Modal -> persisted assistant reply');
  const mapping = (await db.query('SELECT "remoteId" FROM "AiConversation"')).rows;
  assert.equal(mapping.length, 1);
  const tool = await (
    await request(
      '/agent/turns',
      { conversationId: conversation.id, content: '메모장 열어줘' },
      accessToken,
    )
  ).json();
  assert.equal(tool.toolCalls[0]?.tool, 'app.open');
  assert.ok(tool.toolCalls[0].ticket);
  assert.equal(tool.toolCalls[0].requiresConfirmation, false);
  console.log(
    'PASS: live app.open response converted, permission and signed ticket retained (no OS execution)',
  );
  const denied = await (
    await request(
      '/agent/tool-results',
      { ticket: tool.toolCalls[0].ticket, status: 'DENIED', confirmed: false },
      accessToken,
    )
  ).json();
  assert.ok(denied.message?.content);
  console.log('PASS: real denied result -> Modal failure acknowledgement');
  const audio = await (
    await request('/voice/tts', { text: '메모장 열어줘' }, accessToken)
  ).arrayBuffer();
  assert.equal(Buffer.from(audio).toString('ascii', 0, 4), 'RIFF');
  console.log(`PASS: authenticated TTS returns WAV (${audio.byteLength} bytes)`);
  const form = new FormData();
  form.append('audio', new Blob([audio], { type: 'audio/wav' }), 'synthetic.wav');
  const recordingId = `voice_${randomUUID()}`;
  form.append('recordingId', recordingId);
  form.append('conversationId', conversation.id);
  const voice = await (await request('/voice/commands', form, accessToken)).json();
  assert.equal(voice.requestId, recordingId);
  assert.ok(voice.transcript);
  assert.ok(['message', 'tool_call'].includes(voice.type));
  console.log('PASS: synthetic Korean WAV -> live STT/agent -> desktop voice response contract');
  await stop();
  await start();
  const followup = await (
    await request(
      '/agent/turns',
      {
        conversationId: conversation.id,
        content: '실행하지 말고 연결 테스트를 마쳤다고 짧게 말해 주세요.',
      },
      accessToken,
    )
  ).json();
  assert.ok(followup.message?.content);
  assert.deepEqual((await db.query('SELECT "remoteId" FROM "AiConversation"')).rows, mapping);
  console.log('PASS: backend restart preserves AI conversation mapping');
  const unauthorized = await fetch(`http://127.0.0.1:${appPort}/voice/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'test' }),
  });
  assert.equal(unauthorized.status, 401);
  console.log('PASS: TTS remains authenticated');
} catch (error) {
  console.error('FAIL:', error.message.replaceAll(password, '[redacted]'));
  failed = true;
} finally {
  await stop();
  if (db) {
    // Delete only remote sessions created by this isolated test, never enumerate remote history.
    const rows = await db
      .query('SELECT "remoteId" FROM "AiConversation"')
      .catch(() => ({ rows: [] }));
    for (const row of rows.rows) {
      try {
        const r = await fetch(`${remote}/conversations/${encodeURIComponent(row.remoteId)}`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(15000),
        });
        console.log('Test AI session cleanup:', r.status);
      } catch {
        console.log('Test AI session cleanup unavailable');
      }
    }
    await db.end();
  }
  await postgres.stop().catch(() => {});
}
if (failed) process.exitCode = 1;

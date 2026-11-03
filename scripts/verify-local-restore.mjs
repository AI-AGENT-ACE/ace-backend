import 'dotenv/config';
import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { localDatabases } from './local-database-policy.mjs';

const { development, test } = localDatabases(process.env);
const name = 'ace_restore_' + randomUUID().replaceAll('-', '');
if ([development.pathname.slice(1), test.pathname.slice(1)].includes(name))
  throw Error('Distinct restore DB required');
const dir = path.resolve('.local/backups', name);
fs.mkdirSync(dir, { recursive: true });
function run(command, args, env = process.env) {
  const r = spawnSync(command, args, { env, encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) throw Error('External command failed: ' + path.basename(command));
  return r.stdout.trim();
}
// Windows DACL: only the current user and SYSTEM can access this backup directory.
const sid = run('powershell', [
  '-NoProfile',
  '-Command',
  '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
]);
if (!/^S-1-5-[0-9-]+$/.test(sid)) throw Error('Cannot identify backup owner');
run('icacls', [dir, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F']);
const dump = path.join(dir, 'development.dump');
const source = new Client({ connectionString: development.toString() });
let restored;
let created = false;
let stage = 'connect';
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
async function inspect(client) {
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  const counts = {};
  for (const t of tables)
    counts[t] = Number(
      (await client.query(`SELECT count(*)::text n FROM public.${q(t)}`)).rows[0].n,
    );
  const constraints = (
    await client.query(
      "SELECT c.relname AS table_name,co.conname,co.contype,co.convalidated,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,co.conname",
    )
  ).rows;
  const indexes = (
    await client.query(
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
    )
  ).rows;
  const columns = (
    await client.query(
      "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
    )
  ).rows;
  const migrations = (
    await client.query(
      'SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name',
    )
  ).rows;
  return { counts, constraints, indexes, columns, migrations };
}
try {
  await source.connect();
  const version = (await source.query('SHOW server_version')).rows[0].server_version;
  stage = 'snapshot';
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (await source.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
  const before = await inspect(source);
  const env = {
    ...process.env,
    PGHOST: development.hostname,
    PGPORT: development.port || '5432',
    PGUSER: decodeURIComponent(development.username),
    PGPASSWORD: decodeURIComponent(development.password),
    PGDATABASE: development.pathname.slice(1),
  };
  stage = 'dump';
  const dumpVersion = run('pg_dump', ['--version']);
  run(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--snapshot=' + snapshot,
      '--file=' + dump,
    ],
    env,
  );
  await source.query('COMMIT');
  stage = 'create';
  await source.query(`CREATE DATABASE ${q(name)} TEMPLATE template0`);
  created = true;
  await source.query(`REVOKE CONNECT ON DATABASE ${q(name)} FROM PUBLIC`);
  stage = 'restore';
  run(
    'pg_restore',
    [
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-privileges',
      '--dbname=' + name,
      dump,
    ],
    env,
  );
  const target = new URL(development);
  target.pathname = '/' + name;
  restored = new Client({ connectionString: target.toString() });
  await restored.connect();
  await restored.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const after = await inspect(restored);
  await restored.query('COMMIT');
  const compare = {};
  for (const key of Object.keys(before))
    compare[key] = JSON.stringify(before[key]) === JSON.stringify(after[key]);
  const localMigrations = fs
    .readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      checksum: createHash('sha256')
        .update(fs.readFileSync(path.join('prisma/migrations', d.name, 'migration.sql')))
        .digest('hex'),
    }));
  const migrationFilesMatch =
    localMigrations.length === after.migrations.length &&
    localMigrations.every((m) =>
      after.migrations.some(
        (r) =>
          r.migration_name === m.name &&
          r.checksum === m.checksum &&
          r.finished_at &&
          !r.rolled_back_at,
      ),
    );
  const sourceAfter = await inspect(source);
  const report = {
    verifiedAt: new Date().toISOString(),
    restoreDatabase: name,
    backupRelativePath: path.relative(process.cwd(), dump),
    backupBytes: fs.statSync(dump).size,
    backupSha256: createHash('sha256').update(fs.readFileSync(dump)).digest('hex'),
    serverVersion: version,
    dumpVersion,
    compare,
    migrationFilesMatch,
    sourceCountsUnchanged: JSON.stringify(before.counts) === JSON.stringify(sourceAfter.counts),
    counts: after.counts,
    constraintCount: after.constraints.length,
    foreignKeyCount: after.constraints.filter((c) => c.contype === 'f').length,
    allConstraintsValidated: after.constraints.every((c) => c.convalidated),
    indexCount: after.indexes.length,
    migrationNames: after.migrations.map((m) => m.migration_name),
    appConnected: false,
    acl: 'Current user and SYSTEM only; inheritance removed',
    rolesAndGrantsRestored: false,
  };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (
    Object.values(compare).some((v) => !v) ||
    !migrationFilesMatch ||
    !report.allConstraintsValidated
  )
    throw Error('Restore comparison failed');
} catch (error) {
  console.error(
    JSON.stringify({
      stage,
      created,
      restoreDatabase: name,
      error: 'Local backup/restore failed; no source reset or cleanup performed',
    }),
  );
  process.exitCode = 1;
} finally {
  await restored?.end();
  await source.end();
}

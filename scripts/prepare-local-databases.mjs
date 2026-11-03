import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
import { localDatabases } from './local-database-policy.mjs';

// Explicit local repair: no cluster initialization, role password changes or data deletion.
const source = fs.readFileSync('.env', 'utf8');
const env = dotenv.parse(source);
let admin;
try {
  const { development, test } = localDatabases({ ...env, NODE_ENV: process.env.NODE_ENV });
  admin = new pg.Client({
    connectionString: development.toString(),
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  const role = await admin.query('SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1) present', [
    decodeURIComponent(test.username),
  ]);
  console.log('Configured test role exists:', role.rows[0].present);
  const database = test.pathname.slice(1);
  const found = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
  if (!found.rowCount) {
    await admin.query(`CREATE DATABASE "${database}"`);
    console.log('Created separate local test database:', database);
  }
  test.username = development.username;
  test.password = development.password;
  const probe = new pg.Client({ connectionString: test.toString(), connectionTimeoutMillis: 5000 });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
  } finally {
    await probe.end();
  }
  if (!/^TEST_DATABASE_URL\s*=/m.test(source)) throw new Error('TEST_DATABASE_URL line not found.');
  fs.writeFileSync(
    '.env',
    source.replace(
      /^TEST_DATABASE_URL\s*=.*$/m,
      `TEST_DATABASE_URL=${JSON.stringify(test.toString())}`,
    ),
  );
  console.log(
    'Updated only TEST_DATABASE_URL with working local credentials; development settings and data preserved.',
  );
} catch (error) {
  console.error(
    'Local database repair failed; code:',
    /^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : 'LOCAL_SETUP_ERROR',
  );
  process.exitCode = 1;
} finally {
  await admin?.end().catch(() => {});
}

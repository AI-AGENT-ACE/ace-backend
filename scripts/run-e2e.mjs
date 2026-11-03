import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { localDatabases } from './local-database-policy.mjs';

const { test: url } = localDatabases(process.env);
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: url.toString(),
  SWAGGER_ENABLED: 'false',
};
const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', env });
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
};
run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
run('node_modules/jest/bin/jest.js', [
  '--config',
  'test/jest-e2e.json',
  '--runInBand',
  ...process.argv.slice(2),
]);

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localDatabases } from './local-database-policy.mjs';

// Validate before Prisma migration as well as before starting the local server.
localDatabases(process.env);
if (!process.argv.includes('--check')) {
  console.log('로컬 개발 서버: http://127.0.0.1:3001 — 설정된 AI 연결 사용');
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/@nestjs/cli/bin/nest.js', import.meta.url)),
      'start',
      '--watch',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3001' },
    },
  );
  child.on('error', () => {
    console.error('개발 서버를 시작하지 못했습니다. 의존성 설치 상태를 확인해 주세요.');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

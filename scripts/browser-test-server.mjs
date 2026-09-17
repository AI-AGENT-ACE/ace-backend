import { createRequire } from 'node:module';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
const require = createRequire(import.meta.url);
require('reflect-metadata');
dotenv.config({ path: join(import.meta.dirname, '../.env'), quiet: true });
const testUrl = new URL(process.env.TEST_DATABASE_URL || '');
if (!testUrl.pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(testUrl.hostname))
  throw new Error('Browser tests require a separate local *_test database.');
process.env.DATABASE_URL = testUrl.toString();
process.env.NODE_ENV = 'test';
process.env.SWAGGER_ENABLED = 'false';
process.env.AI_SERVER_URL = 'http://127.0.0.1:3999';
process.env.CORS_ORIGINS = 'http://127.0.0.1:1430,http://localhost:1430';
const migration = spawnSync(
  process.execPath,
  [join(import.meta.dirname, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
  { cwd: join(import.meta.dirname, '..'), stdio: 'inherit', env: process.env },
);
if (migration.status !== 0) process.exit(migration.status || 1);
const { Test } = require('@nestjs/testing');
const { ThrottlerGuard } = require('@nestjs/throttler');
const { AppModule } = require('../dist/app.module.js');
const { AiServerClient } = require('../dist/agent/ports/ai-server.client.js');
const { AuthService } = require('../dist/auth/auth.service.js');
const { PrismaService } = require('../dist/common/prisma/prisma.service.js');
const { configureApp } = require('../dist/common/http/configure-app.js');
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(ThrottlerGuard)
  .useValue({ canActivate: () => true })
  .overrideProvider(AiServerClient)
  .useValue({
    generate: async () => ({
      content: '테스트 AI 응답\n\n| 기능 | 결과 |\n| --- | --- |\n| API | 연결됨 |',
      toolCalls: [],
    }),
  })
  .compile();
const app = module.createNestApplication({ bodyParser: false, logger: false });
configureApp(app);
// This runner owns shutdown so Nest's signal handler and fixture cleanup do not race.
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');
const prisma = app.get(PrismaService);
const ids = [];
// Fixture endpoints exist only in this explicit test entry point, never in production AppModule.
app.getHttpAdapter().get('/__test/fixture', async (req, res, next) => {
  try {
    const email = `browser-${randomUUID()}@example.com`;
    const password = 'browser-test-password-123';
    const account = await app
      .get(AuthService)
      .register({ email, password, displayName: '브라우저 테스트' });
    ids.push(account.user.id);
    let conversationId = null;
    if (req.query.seed === 'true') {
      for (let index = 0; index < 25; index++) {
        const conversation = await prisma.conversation.create({
          data: {
            userId: account.user.id,
            title: index === 24 ? '페이지 메시지' : `페이지 대화 ${index + 1}`,
            updatedAt: new Date(Date.now() - (25 - index) * 1000),
          },
        });
        if (index === 24) conversationId = conversation.id;
      }
      await prisma.message.createMany({
        data: Array.from({ length: 68 }, (_, index) => ({
          conversationId,
          role: index % 2 ? 'ASSISTANT' : 'USER',
          content: `메시지 ${index + 1}\n스크롤 위치 확인용 본문\n실제 PostgreSQL 테스트 데이터`,
          createdAt: new Date(Date.now() - (68 - index) * 1000),
        })),
      });
    }
    res.json({ email, password, conversationId });
  } catch (error) {
    next(error);
  }
});
await app.listen(3002, '127.0.0.1');
console.log('ACE browser-test backend ready on 127.0.0.1:3002');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await prisma.voiceCommandExecutionLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.toolExecutionLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await app.close();
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

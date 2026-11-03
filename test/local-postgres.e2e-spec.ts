import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ConfigService } from '@nestjs/config';
import { TrashCleanupScheduler } from '../src/conversations/trash-cleanup.scheduler';
import { TrashRetentionService } from '../src/conversations/trash-retention.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/http/configure-app';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ConversationsRepository } from '../src/conversations/conversations.repository';
import { AiServerClient, AiTurnResponse } from '../src/agent/ports/ai-server.client';
import { Prisma } from '../src/generated/prisma/client';
import { ToolName } from '../src/tools/catalog/tool-name';

describe('Local PostgreSQL lifecycle and execution integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let repo: ConversationsRepository;
  const users: string[] = [];
  const conversations: string[] = [];
  let owner: { user: { id: string }; accessToken: string };
  let other: typeof owner;
  const ai = {
    generate: jest.fn(async (): Promise<AiTurnResponse> => ({
      content: '처리 결과',
      toolCalls: [],
    })),
  };
  const day = 86400000;
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  async function create(deletedAt: Date | null = null) {
    const row = await db.conversation.create({
      data: { userId: owner.user.id, title: '통합 시험', deletedAt },
    });
    conversations.push(row.id);
    return row.id;
  }
  async function blockedBy(pid: number) {
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        Array<{ n: bigint }>
      >`SELECT count(*) n FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
      if (Number(rows[0]?.n) > 0) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Expected a real PostgreSQL row-lock wait');
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || '');
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
      throw new Error('Separate local test database required');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(AiServerClient)
      .useValue(ai)
      .compile();
    app = module.createNestApplication({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    repo = app.get(ConversationsRepository);
    for (let i = 0; i < 2; i++) {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `db-${randomUUID()}@example.com`, password: randomUUID() + 'aA1!' })
        .expect(201);
      users.push(response.body.user.id);
      if (i === 0) owner = response.body;
      else other = response.body;
    }
  });
  afterAll(async () => {
    if (db && users.length) {
      // Only fixtures owned by this run; never truncate, reset or delete pre-existing data.
      await db.nativeExecution.deleteMany({ where: { userId: { in: users } } });
      await db.toolExecutionLog.deleteMany({ where: { userId: { in: users } } });
      await db.voiceCommandExecutionLog.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });
  it('soft deletes and restores through authenticated HTTP while preserving messages', async () => {
    const id = await create();
    await db.message.create({
      data: { conversationId: id, role: 'USER', content: '보존할 시험 메시지' },
    });
    await request(app.getHttpServer())
      .delete(`/conversations/${id}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .get(`/conversations/${id}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(404);
    const trash = await request(app.getHttpServer())
      .get('/conversations/trash')
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect(trash.body.items.some((r: { id: string }) => r.id === id)).toBe(true);
    await request(app.getHttpServer())
      .patch(`/conversations/${id}/restore`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect((await db.conversation.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
    expect(await db.message.count({ where: { conversationId: id } })).toBe(1);
  });
  it('purges only expired candidates, cascades messages and is idempotent', async () => {
    const expired = await create(new Date(Date.now() - 31 * day)),
      recent = await create(new Date()),
      active = await create();
    await db.message.create({
      data: { conversationId: expired, role: 'USER', content: '만료 시험' },
    });
    const cutoff = new Date(Date.now() - 30 * day);
    expect((await repo.purge([expired, recent, active], cutoff)).count).toBe(1);
    expect((await repo.purge([expired, recent, active], cutoff)).count).toBe(0);
    expect(await db.message.count({ where: { conversationId: expired } })).toBe(0);
    expect(await db.conversation.count({ where: { id: { in: [recent, active] } } })).toBe(2);
    await request(app.getHttpServer())
      .patch(`/conversations/${expired}/restore`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(404);
  });
  it('rechecks expiry after waiting for a concurrent restore transaction', async () => {
    const id = await create(new Date(Date.now() - 31 * day));
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    let purge: ReturnType<ConversationsRepository['purge']> | undefined;
    try {
      await client.query('BEGIN');
      // Restore started before the retention boundary; cleanup sees a later cutoff.
      await client.query('UPDATE "Conversation" SET "deletedAt"=NULL WHERE "id"=$1', [id]);
      const pid = (await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      purge = repo.purge([id], new Date(Date.now() - 30 * day));
      await blockedBy(pid);
      await client.query('COMMIT');
      expect((await purge).count).toBe(0);
      expect((await db.conversation.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
      await purge?.catch(() => {});
    }
  });
  it('startup background cleanup processes more than one batch and preserves active/restored rows', async () => {
    // Do not let a global maintenance job remove fixtures or data from another test run.
    expect(
      await db.conversation.count({
        where: { userId: { notIn: users }, deletedAt: { lte: new Date(Date.now() - 30 * day) } },
      }),
    ).toBe(0);
    expect(await db.fileDeletionJob.count()).toBe(0);
    const expiredIds = Array.from({ length: 101 }, () => randomUUID());
    await db.conversation.createMany({
      data: expiredIds.map((id) => ({
        id,
        userId: owner.user.id,
        deletedAt: new Date(Date.now() - 31 * day),
      })),
    });
    const active = await create(),
      restored = await create(new Date());
    await repo.restore(owner.user.id, restored, new Date(Date.now() - 30 * day));
    const scheduler = new TrashCleanupScheduler(
      app.get(TrashRetentionService),
      new ConfigService({
        NODE_ENV: 'development',
        TRASH_CLEANUP_ENABLED: true,
        TRASH_CLEANUP_BATCH_SIZE: 100,
      }),
    );
    try {
      scheduler.onApplicationBootstrap();
      for (let i = 0; i < 200; i++) {
        if ((await db.conversation.count({ where: { id: { in: expiredIds } } })) === 0) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(await db.conversation.count({ where: { id: { in: expiredIds } } })).toBe(0);
      expect(
        await db.conversation.count({ where: { id: { in: [active, restored] }, deletedAt: null } }),
      ).toBe(2);
    } finally {
      scheduler.onModuleDestroy();
    }
  });
  it('returns no restored row when cleanup commits first; never resurrects deleted data', async () => {
    const id = await create(new Date(Date.now() - 31 * day));
    const locked = deferred(),
      release = deferred();
    let pid = 0;
    const gated = new ConversationsRepository({
      $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        db.$transaction(
          async (tx) => {
            pid = Number(
              (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`)[0]!.pid,
            );
            const result = await fn(tx);
            locked.resolve();
            await release.promise;
            return result;
          },
          { timeout: 10000 },
        ),
    } as PrismaService);
    const purge = gated.purge([id], new Date(Date.now() - 30 * day));
    let restore: Promise<{ count: number }> | undefined;
    try {
      await locked.promise;
      // Prisma updateMany is lazy; start the query before observing its lock wait.
      restore = Promise.resolve(repo.restore(owner.user.id, id, new Date(Date.now() - 32 * day)));
      await blockedBy(pid);
      release.resolve();
      expect((await purge).count).toBe(1);
      expect((await restore).count).toBe(0);
      expect(await db.conversation.findUnique({ where: { id } })).toBeNull();
    } finally {
      release.resolve();
      await purge.catch(() => {});
      await restore?.catch(() => {});
    }
  });
  it('stores and retrieves execution events, rejects foreign access and deduplicates concurrent events', async () => {
    const parent = randomUUID();
    const call = await request(app.getHttpServer())
      .post('/agent/executions')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ requestId: parent, tool: 'app.open', arguments: { appName: 'notepad' } })
      .expect(201);
    const { ticket, executionId } = call.body;
    const attemptId = randomUUID();
    const event = (state: string) =>
      request(app.getHttpServer())
        .post('/agent/executions/events')
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ ticket, attemptId, state });
    await Promise.all([event('REQUESTED').expect(201), event('REQUESTED').expect(201)]);
    await event('RUNNING').expect(201);
    await event('SUCCEEDED').expect(201);
    const history = await request(app.getHttpServer())
      .get(`/agent/executions/${executionId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect(history.body).toMatchObject({ id: executionId, requestId: parent, state: 'SUCCEEDED' });
    expect(history.body.events.map((e: { state: string }) => e.state)).toEqual([
      'REQUESTED',
      'RUNNING',
      'SUCCEEDED',
    ]);
    await request(app.getHttpServer())
      .get(`/agent/executions/${executionId}`)
      .auth(other.accessToken, { type: 'bearer' })
      .expect(404);
    await event('FAILED').expect(409);
    expect(
      await db.nativeExecutionEvent.count({
        where: { executionId, attemptId, state: 'REQUESTED' },
      }),
    ).toBe(1);
  });
  it('accepts only one of two concurrent final results and resumes AI only once', async () => {
    const id = await create(),
      executionId = randomUUID();
    ai.generate.mockResolvedValueOnce({
      content: '',
      toolCalls: [{ id: executionId, tool: ToolName.APP_OPEN, arguments: { appName: 'notepad' } }],
    });
    const turn = await request(app.getHttpServer())
      .post('/agent/turns')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ conversationId: id, content: '메모장 열기' })
      .expect(201);
    const ticket = turn.body.toolCalls[0].ticket,
      attemptId = randomUUID();
    for (const state of ['REQUESTED', 'RUNNING', 'SUCCEEDED'])
      await request(app.getHttpServer())
        .post('/agent/executions/events')
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ ticket, attemptId, state })
        .expect(201);
    const before = ai.generate.mock.calls.length;
    const submit = () =>
      request(app.getHttpServer())
        .post('/agent/tool-results')
        .auth(owner.accessToken, { type: 'bearer' })
        .send({
          ticket,
          executionId,
          attemptId,
          status: 'SUCCEEDED',
          confirmed: true,
          duration: 1,
          result: { summary: '완료' },
        });
    const results = await Promise.all([submit(), submit()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.toolExecutionLog.count({ where: { executionId } })).toBe(1);
    expect(await db.message.count({ where: { conversationId: id, role: 'TOOL' } })).toBe(1);
    expect(ai.generate.mock.calls.length - before).toBe(1);
  });
});

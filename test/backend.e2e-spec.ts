import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { AiServerClient } from '../src/agent/ports/ai-server.client';
import { PasswordHasher } from '../src/auth/services/password-hasher.service';
import { configureApp } from '../src/common/http/configure-app';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TrashRetentionService } from '../src/conversations/trash-retention.service';
import { MessageRole, ToolExecutionStatus } from '../src/generated/prisma/client';
import { ToolName } from '../src/tools/catalog/tool-name';
import { WeatherProvider } from '../src/weather/ports/weather.provider';

interface Account {
  user: { id: string; email: string };
  accessToken: string;
  refreshToken: string;
}

describe('ACE APIs with real PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let first: Account;
  let second: Account;
  let conversation: string;
  let foreignConversation: string;
  const accountIds: string[] = [];
  const password = 'test-password-long-123';
  const ai = { generate: jest.fn() };
  const weather = {
    current: jest.fn().mockResolvedValue({
      location: 'Seoul',
      temperatureCelsius: 23,
      feelsLikeCelsius: 22,
      humidityPercent: 50,
      description: 'clear',
      observedAt: '2026-09-17T00:00:00Z',
    }),
  };

  const register = async () => {
    const email = `${randomUUID()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    const account = response.body as Account;
    accountIds.push(account.user.id);
    return account;
  };
  const createConversation = async (account = first, title = 'ACE test') => {
    const response = await request(app.getHttpServer())
      .post('/conversations')
      .auth(account.accessToken, { type: 'bearer' })
      .send({ title })
      .expect(201);
    return response.body.id as string;
  };
  const toolTurn = async (tool: ToolName, arguments_: Record<string, unknown>) => {
    const id = await createConversation();
    ai.generate.mockResolvedValueOnce({
      content: 'Prepared',
      toolCalls: [{ id: 'call-1', tool, arguments: arguments_ }],
    });
    const response = await request(app.getHttpServer())
      .post('/agent/turns')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ conversationId: id, content: 'Please run the tool' })
      .expect(201);
    return {
      id,
      call: response.body.toolCalls[0] as {
        ticket: string;
        requiresConfirmation: boolean;
        executionLocation: string;
      },
    };
  };

  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_test'))
      throw new Error('Test database required');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(AiServerClient)
      .useValue(ai)
      .overrideProvider(WeatherProvider)
      .useValue(weather)
      .compile();
    app = module.createNestApplication({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    first = await register();
    second = await register();
    conversation = await createConversation(first);
    foreignConversation = await createConversation(second);
  });
  beforeEach(() => {
    ai.generate.mockReset().mockResolvedValue({ content: 'Finished', toolCalls: [] });
    weather.current.mockClear();
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.toolExecutionLog.deleteMany({ where: { userId: { in: accountIds } } });
      await prisma.voiceCommandExecutionLog.deleteMany({ where: { userId: { in: accountIds } } });
      await prisma.user.deleteMany({ where: { id: { in: accountIds } } });
    }
    if (app) await app.close();
  });

  it('starts with a real PostgreSQL connection', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'connected' });
    expect(response.headers['x-request-id']).toBeDefined();
  });
  it('requires authentication for account data', async () => {
    const response = await request(app.getHttpServer()).get('/conversations').expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });
  it('persists only voice execution metadata, rejects transcripts and scopes logs to their owner', async () => {
    const before = await prisma.message.count({
      where: { conversation: { userId: first.user.id } },
    });
    const response = await request(app.getHttpServer())
      .post('/logs/voice')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ commandType: 'system.status', status: 'SUCCESS', duration: 12 })
      .expect(201);
    expect(response.body).toMatchObject({
      userId: first.user.id,
      commandType: 'system.status',
      duration: 12,
    });
    expect(await prisma.message.count({ where: { conversation: { userId: first.user.id } } })).toBe(
      before,
    );
    await request(app.getHttpServer())
      .post('/logs/voice')
      .auth(first.accessToken, { type: 'bearer' })
      .send({
        commandType: 'system.status',
        status: 'SUCCESS',
        duration: 12,
        transcript: 'sensitive raw voice',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/logs/voice')
      .send({ commandType: 'system.status', status: 'SUCCESS', duration: 12 })
      .expect(401);
    await request(app.getHttpServer())
      .post('/logs/voice')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ commandType: 'arbitrary secret text', status: 'SUCCESS', duration: 12 })
      .expect(400);
    const own = await request(app.getHttpServer())
      .get('/logs/voice')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(own.body.items.some((item: { id: string }) => item.id === response.body.id)).toBe(true);
    const foreign = await request(app.getHttpServer())
      .get('/logs/voice')
      .auth(second.accessToken, { type: 'bearer' })
      .expect(200);
    expect(foreign.body.items).toEqual([]);
    await request(app.getHttpServer())
      .get(`/logs/voice?cursor=${response.body.id}`)
      .auth(second.accessToken, { type: 'bearer' })
      .expect(400);
  });
  it('persists password hashes and refresh digests, never plaintext credentials', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: first.user.id } });
    expect(user.passwordHash).not.toBe(password);
    expect(await new PasswordHasher().verify(password, user.passwordHash)).toBe(true);
    const session = await prisma.authSession.findFirstOrThrow({ where: { userId: first.user.id } });
    expect(session.refreshHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.refreshHash).not.toBe(first.refreshToken);
    expect(first.user).not.toHaveProperty('passwordHash');
  });
  it('rejects a duplicate email with a stable conflict code', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: first.user.email, password })
      .expect(409);
    expect(response.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });
  it('validates password length and does not accept foreign ownership fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: first.user.email, password: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/conversations')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ title: 'bad', userId: second.user.id })
      .expect(400);
  });
  it('enforces registration password composition and accepts eight characters', async () => {
    const email = `${randomUUID()}@example.com`;
    for (const candidate of [
      'Abcde1!',
      'abcdefgh',
      'abcdefg1',
      '1234567!',
      'abcdefg!',
      'Abcdef1 ',
      'Abcdef1한',
      'Ab1!' + 'a'.repeat(125),
    ]) {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: candidate })
        .expect(400);
    }
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Abcdef1!' })
      .expect(201);
    accountIds.push((response.body as Account).user.id);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Abcdef1!' })
      .expect(200);
  });
  it('creates, renames and pins an owned conversation', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/conversations/${conversation}`)
      .auth(first.accessToken, { type: 'bearer' })
      .send({ title: 'Renamed', isPinned: true })
      .expect(200);
    expect(response.body).toMatchObject({
      title: 'Renamed',
      isPinned: true,
      userId: first.user.id,
    });
  });
  it('blocks every conversation operation from a different account', async () => {
    for (const method of ['get', 'patch', 'delete'] as const) {
      const client = request(app.getHttpServer());
      await client[method](`/conversations/${conversation}`)
        .auth(second.accessToken, { type: 'bearer' })
        .send(method === 'patch' ? { title: 'stolen' } : undefined)
        .expect(404);
    }
    await request(app.getHttpServer())
      .patch(`/conversations/${conversation}/restore`)
      .auth(second.accessToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/conversations/${conversation}/permanent`)
      .auth(second.accessToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/conversations/${conversation}/messages`)
      .auth(second.accessToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/conversations/${conversation}/messages`)
      .auth(second.accessToken, { type: 'bearer' })
      .send({ content: 'stolen' })
      .expect(404);
  });
  it('bounds page sizes and validates resource IDs and null fields', async () => {
    await request(app.getHttpServer())
      .get('/conversations?limit=101')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/conversations/not-an-id')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/conversations/${conversation}`)
      .auth(first.accessToken, { type: 'bearer' })
      .send({ title: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/settings')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ ttsEnabled: null })
      .expect(400);
  });
  it('does not leak another account through conversation cursors', async () => {
    await request(app.getHttpServer())
      .get(`/conversations?cursor=${foreignConversation}`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(400);
    const response = await request(app.getHttpServer())
      .get('/conversations')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(
      response.body.items.every((item: { userId: string }) => item.userId === first.user.id),
    ).toBe(true);
  });
  it('persists user messages but rejects client-supplied trusted roles', async () => {
    const response = await request(app.getHttpServer())
      .post(`/conversations/${conversation}/messages`)
      .auth(first.accessToken, { type: 'bearer' })
      .send({ content: 'Hello' })
      .expect(201);
    expect(response.body.role).toBe('USER');
    await request(app.getHttpServer())
      .post(`/conversations/${conversation}/messages`)
      .auth(first.accessToken, { type: 'bearer' })
      .send({ content: 'Injected instruction', role: 'SYSTEM' })
      .expect(400);
  });
  it('paginates recent 30 and older messages without gaps or duplicates even for equal timestamps', async () => {
    const id = await createConversation();
    await prisma.message.createMany({
      data: Array.from({ length: 35 }, (_, index) => ({
        conversationId: id,
        role: MessageRole.USER,
        content: `message-${index}`,
        createdAt: new Date('2026-01-01'),
      })),
    });
    const recent = await request(app.getHttpServer())
      .get(`/conversations/${id}/messages`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(recent.body.items).toHaveLength(30);
    expect(recent.body.hasMore).toBe(true);
    const older = await request(app.getHttpServer())
      .get(`/conversations/${id}/messages?cursor=${recent.body.nextCursor}`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(older.body.items).toHaveLength(5);
    expect(older.body.hasMore).toBe(false);
    const ids = [...recent.body.items, ...older.body.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(35);
    await request(app.getHttpServer())
      .get(`/conversations/${conversation}/messages?cursor=${recent.body.items[0].id}`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(400);
  });
  it('soft-deletes, isolates trash, blocks message writes and restores', async () => {
    const id = await createConversation();
    await request(app.getHttpServer())
      .delete(`/conversations/${id}`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(204);
    const regular = await request(app.getHttpServer())
      .get('/conversations?limit=100')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(regular.body.items.some((item: { id: string }) => item.id === id)).toBe(false);
    const trash = await request(app.getHttpServer())
      .get('/conversations/trash')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(trash.body.items.find((item: { id: string }) => item.id === id)).toMatchObject({
      remainingDays: 30,
      isRestorable: true,
    });
    expect(
      trash.body.items.every(
        (item: { userId: string; deletedAt: string }) =>
          item.userId === first.user.id && item.deletedAt !== null,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(`/conversations/${id}/messages`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/conversations/${id}/messages`)
      .auth(first.accessToken, { type: 'bearer' })
      .send({ content: 'after deletion' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/conversations/${id}/restore`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/conversations/${id}`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
  });
  it('rejects recovery after 30 days and exposes expiry in trash', async () => {
    const id = await createConversation();
    await prisma.conversation.update({
      where: { id },
      data: { deletedAt: new Date(Date.now() - 31 * 86400000) },
    });
    const response = await request(app.getHttpServer())
      .patch(`/conversations/${id}/restore`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(410);
    expect(response.body.code).toBe('CONVERSATION_EXPIRED');
  });
  it('permanently deletes trash with cascading messages, but protects active conversations', async () => {
    const id = await createConversation();
    await prisma.message.create({
      data: { conversationId: id, role: MessageRole.USER, content: 'remove me' },
    });
    await request(app.getHttpServer())
      .delete(`/conversations/${id}/permanent`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/conversations/${id}`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/conversations/${id}/permanent`)
      .auth(first.accessToken, { type: 'bearer' })
      .expect(204);
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(0);
    expect(await prisma.conversation.findUnique({ where: { id } })).toBeNull();
  });
  it('purges expired trash in bounded batches without deleting recent trash', async () => {
    const expired = await createConversation();
    const recent = await createConversation();
    await prisma.conversation.update({
      where: { id: expired },
      data: { deletedAt: new Date(Date.now() - 32 * 86400000) },
    });
    await prisma.conversation.update({ where: { id: recent }, data: { deletedAt: new Date() } });
    await prisma.message.create({
      data: { conversationId: expired, role: MessageRole.USER, content: 'expired' },
    });
    let batch;
    do {
      batch = await app.get(TrashRetentionService).purgeExpired(1);
    } while (batch.scanned > 0);
    expect(await prisma.conversation.findUnique({ where: { id: expired } })).toBeNull();
    expect(await prisma.message.count({ where: { conversationId: expired } })).toBe(0);
    expect(await prisma.conversation.findUnique({ where: { id: recent } })).not.toBeNull();
  });
  it('updates only account cloud settings and rejects local runtime fields', async () => {
    const response = await request(app.getHttpServer())
      .patch('/settings')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ responseLanguage: 'en-US', ttsEnabled: true })
      .expect(200);
    expect(response.body.userId).toBe(first.user.id);
    const other = await request(app.getHttpServer())
      .get('/settings')
      .auth(second.accessToken, { type: 'bearer' })
      .expect(200);
    expect(other.body.responseLanguage).toBe('ko');
    await request(app.getHttpServer())
      .patch('/settings')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ wakeWord: 'ACE' })
      .expect(400);
  });
  it('preserves system confirmation despite an ALWAYS_ALLOW preference', async () => {
    const response = await request(app.getHttpServer())
      .put('/settings/permissions/file.delete')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ policy: 'ALWAYS_ALLOW' })
      .expect(200);
    expect(response.body.requiresConfirmation).toBe(true);
    const other = await request(app.getHttpServer())
      .get('/settings/permissions')
      .auth(second.accessToken, { type: 'bearer' })
      .expect(200);
    expect(other.body).toEqual([]);
    await request(app.getHttpServer())
      .put('/settings/permissions/unknown.tool')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ policy: 'ALWAYS_ALLOW' })
      .expect(400);
  });
  it('executes a cloud weather tool but never executes local tools', async () => {
    await request(app.getHttpServer())
      .post('/tools/execute')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ toolName: 'app.open', arguments: { appName: 'Notepad' }, confirmed: true })
      .expect(400);
    expect(weather.current).not.toHaveBeenCalled();
    const response = await request(app.getHttpServer())
      .post('/tools/execute')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ toolName: 'weather.current', arguments: { latitude: 37.5, longitude: 127 } })
      .expect(201);
    expect(response.body.result.location).toBe('Seoul');
    expect(weather.current).toHaveBeenCalledWith({ latitude: 37.5, longitude: 127 });
    await request(app.getHttpServer())
      .post('/tools/execute')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ toolName: 'weather.current', arguments: { latitude: 91, longitude: 127 } })
      .expect(400);
  });
  it('requires confirmation for a cloud tool according to the stored preference', async () => {
    await request(app.getHttpServer())
      .put('/settings/permissions/weather.current')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ policy: 'ASK' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/tools/execute')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ toolName: 'weather.current', arguments: { latitude: 37, longitude: 127 } })
      .expect(409);
    expect(weather.current).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/tools/execute')
      .auth(first.accessToken, { type: 'bearer' })
      .send({
        toolName: 'weather.current',
        arguments: { latitude: 37, longitude: 127 },
        confirmed: true,
      })
      .expect(201);
  });
  it('returns signed local handoffs without storing the tool arguments', async () => {
    const { id, call } = await toolTurn(ToolName.APP_OPEN, { appName: 'SensitiveApp' });
    expect(call.executionLocation).toBe('LOCAL');
    expect(call.requiresConfirmation).toBe(true);
    const claims = Buffer.from(call.ticket.split('.')[1]!, 'base64url').toString();
    expect(claims).not.toContain('SensitiveApp');
    const history = await prisma.message.findMany({ where: { conversationId: id } });
    expect(JSON.stringify(history)).not.toContain('SensitiveApp');
    expect(weather.current).not.toHaveBeenCalled();
  });
  it('rejects a handoff result from another account', async () => {
    const { call } = await toolTurn(ToolName.APP_OPEN, { appName: 'Notepad' });
    await request(app.getHttpServer())
      .post('/agent/tool-results')
      .auth(second.accessToken, { type: 'bearer' })
      .send({ ticket: call.ticket, status: ToolExecutionStatus.SUCCEEDED, confirmed: true })
      .expect(401);
  });
  it('forwards local output transiently and stores only normalized markers and minimal logs', async () => {
    const { id, call } = await toolTurn(ToolName.APP_OPEN, { appName: 'Notepad' });
    await request(app.getHttpServer())
      .post('/agent/tool-results')
      .auth(first.accessToken, { type: 'bearer' })
      .send({
        ticket: call.ticket,
        status: ToolExecutionStatus.SUCCEEDED,
        confirmed: true,
        result: { private: 'private-output' },
        duration: 120,
      })
      .expect(201);
    expect(ai.generate.mock.calls.at(-1)![0].toolResults[0].result).toEqual({
      private: 'private-output',
    });
    const toolMessage = await prisma.message.findFirstOrThrow({
      where: { conversationId: id, role: MessageRole.TOOL },
    });
    expect(toolMessage.content).toBe('app.open: SUCCEEDED');
    const logs = await prisma.toolExecutionLog.findMany({ where: { userId: first.user.id } });
    expect(JSON.stringify(logs)).not.toContain('private-output');
    expect(logs.every((log) => !('arguments' in log) && !('deviceId' in log))).toBe(true);
  });
  it('rejects changed cloud arguments and does not accept client-reported cloud success', async () => {
    const { call } = await toolTurn(ToolName.WEATHER_CURRENT, { latitude: 37, longitude: 127 });
    await request(app.getHttpServer())
      .post('/agent/cloud-tools')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ ticket: call.ticket, arguments: { latitude: 38, longitude: 127 }, confirmed: true })
      .expect(400);
    await request(app.getHttpServer())
      .post('/agent/tool-results')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ ticket: call.ticket, status: ToolExecutionStatus.SUCCEEDED, confirmed: true })
      .expect(400);
    expect(weather.current).not.toHaveBeenCalled();
  });
  it('executes a signed cloud call on the server and resumes the AI conversation', async () => {
    const { call } = await toolTurn(ToolName.WEATHER_CURRENT, { latitude: 37, longitude: 127 });
    const response = await request(app.getHttpServer())
      .post('/agent/cloud-tools')
      .auth(first.accessToken, { type: 'bearer' })
      .send({ ticket: call.ticket, arguments: { longitude: 127, latitude: 37 }, confirmed: true })
      .expect(201);
    expect(weather.current).toHaveBeenCalledTimes(1);
    expect(response.body.message.role).toBe('ASSISTANT');
  });
  it('returns private logs only to their owner', async () => {
    const response = await request(app.getHttpServer())
      .get('/logs/tools')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(200);
    expect(
      response.body.items.every((item: { userId: string }) => item.userId === first.user.id),
    ).toBe(true);
    const other = await request(app.getHttpServer())
      .get('/logs/tools')
      .auth(second.accessToken, { type: 'bearer' })
      .expect(200);
    expect(other.body.items).toEqual([]);
  });
  it('handles malformed and oversized JSON with public validation errors', async () => {
    const malformed = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad-json')
      .expect(400);
    expect(malformed.body.code).toBe('VALIDATION_ERROR');
    const large = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ content: 'a'.repeat(140000) })
      .expect(413);
    expect(large.body.code).toBe('VALIDATION_ERROR');
  });
  it('rotates refresh tokens and invalidates the session upon refresh replay', async () => {
    const account = await register();
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: account.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(account.refreshToken);
    await request(app.getHttpServer())
      .get('/users/me')
      .auth(rotated.body.accessToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: account.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .auth(rotated.body.accessToken, { type: 'bearer' })
      .expect(401);
  });
  it('logout revokes access and refresh, and rejects refresh tokens as bearer access', async () => {
    const account = await register();
    await request(app.getHttpServer())
      .get('/users/me')
      .auth(account.refreshToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .auth(account.accessToken, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/users/me')
      .auth(account.accessToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: account.refreshToken })
      .expect(401);
  });
});

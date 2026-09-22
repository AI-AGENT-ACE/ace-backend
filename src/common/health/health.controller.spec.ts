import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { JsonHttpClient } from '../http/json-http.client';

describe('HealthController readiness', () => {
  const create = () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      authSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const config = { get: jest.fn() };
    const http = { request: jest.fn().mockResolvedValue({ status: 'ok' }) };
    const controller = new HealthController(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      http as unknown as JsonHttpClient,
    );
    return { prisma, config, http, controller };
  };
  it('accepts initialized tables without requiring existing accounts', async () => {
    const { controller } = create();
    await expect(controller.health()).resolves.toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });
  it.each(['user', 'authSession'] as const)(
    'rejects a missing %s table even when SELECT 1 succeeds',
    async (table) => {
      const { prisma, controller } = create();
      prisma[table].findFirst.mockRejectedValue({ code: 'P2021' });
      await expect(controller.health()).rejects.toMatchObject({ status: 503 });
    },
  );
  it('reports an unavailable configured AI service as degraded', async () => {
    const { config, http, controller } = create();
    config.get.mockImplementation((key: string) =>
      key === 'AI_SERVER_URL' ? 'http://ai:8000' : undefined,
    );
    http.request.mockRejectedValue(new Error('offline'));
    await expect(controller.health()).resolves.toMatchObject({
      status: 'degraded',
      database: 'connected',
      ai: 'unavailable',
    });
  });

  it('keeps liveness independent from external dependencies', () => {
    const { controller } = create();
    expect(controller.live()).toMatchObject({ status: 'ok', service: 'ace-backend' });
  });
});

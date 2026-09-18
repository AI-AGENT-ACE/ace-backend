import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController readiness', () => {
  const create = () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      authSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const controller = new HealthController(
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    return { prisma, controller };
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
});

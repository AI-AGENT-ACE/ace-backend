import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { AuthRepository } from '../../auth/auth.repository';
import { TokenService } from '../../auth/services/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { JsonHttpClient } from '../http/json-http.client';
import { configureApp } from '../http/configure-app';
import { validateEnvironment } from '../config/environment';
import { HealthController } from './health.controller';

@Controller('private-probe')
class PrivateProbe {
  @Get() get() {
    return { protected: true };
  }
}

describe('liveness HTTP routing and guards', () => {
  let app: INestApplication;
  const dependencyCall = jest.fn(() => {
    throw new Error('External dependencies must not be used by liveness');
  });

  beforeAll(async () => {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/no_connection',
      JWT_ACCESS_SECRET: 'test-access-secret-not-a-real-secret-123456',
      JWT_REFRESH_SECRET: 'test-refresh-secret-not-a-real-secret-123456',
    });
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1 }])],
      controllers: [HealthController, PrivateProbe],
      providers: [
        { provide: ConfigService, useValue: new ConfigService(config) },
        { provide: PrismaService, useValue: { $queryRaw: dependencyCall } },
        { provide: JsonHttpClient, useValue: { request: dependencyCall } },
        { provide: TokenService, useValue: { verify: dependencyCall } },
        { provide: AuthRepository, useValue: { findActiveSession: dependencyCall } },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app?.close());

  it('returns exactly 200/ok without credentials or dependencies, even past the request limit', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    }
    expect(dependencyCall).not.toHaveBeenCalled();
  });

  it('keeps authentication enabled for protected endpoints', async () => {
    await request(app.getHttpServer()).get('/private-probe').expect(401);
    expect(dependencyCall).not.toHaveBeenCalled();
  });
});

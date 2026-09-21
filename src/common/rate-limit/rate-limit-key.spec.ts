import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import { endpointCategory, rateLimitKey, rateLimitTracker } from './rate-limit-key';

describe('rate limit key policy', () => {
  it('separates anonymous IP addresses', () => {
    expect(rateLimitTracker({ ip: '10.0.0.1' })).not.toBe(rateLimitTracker({ ip: '10.0.0.2' }));
  });
  it('separates authenticated users even on the same IP', () => {
    expect(rateLimitTracker({ ip: '10.0.0.1', auth: { userId: 'a' } })).not.toBe(
      rateLimitTracker({ ip: '10.0.0.1', auth: { userId: 'b' } }),
    );
  });
  it('adds an endpoint category and reserved namespace', () => {
    const request = { ip: '10.0.0.1', baseUrl: '', route: { path: '/agent/turns' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    expect(endpointCategory(request)).toBe('ai');
    expect(rateLimitKey(context, 'ip:10.0.0.1', 'default')).toBe(
      'ratelimit:default:ai:ip:10.0.0.1',
    );
  });
  it('allows requests up to the limit and rejects the next request with 429', async () => {
    const storage = new ThrottlerStorageService();
    const guard = new ThrottlerGuard(
      {
        throttlers: [{ name: 'default', ttl: 60000, limit: 2 }],
        getTracker: (request) => rateLimitTracker(request),
        generateKey: rateLimitKey,
      },
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
    const request = { ip: '10.0.0.8', route: { path: '/auth/login' } };
    const response = { header: jest.fn() };
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    storage.onApplicationShutdown();
  });
});

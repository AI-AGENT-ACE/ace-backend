import { validateEnvironment } from './environment';

const required = {
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/deploy_check?sslmode=require',
  JWT_ACCESS_SECRET: 'test-access-secret-not-a-real-secret-123456',
  JWT_REFRESH_SECRET: 'test-refresh-secret-not-a-real-secret-123456',
};

describe('deployment environment', () => {
  it('uses the platform port and a public production listener without requiring AI or Redis', () => {
    const config = validateEnvironment({ ...required, NODE_ENV: 'production', PORT: '10000' });
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.PORT).toBe(10000);
    expect(config.AI_SERVER_URL).toBeUndefined();
    expect(config.DATABASE_URL).toBe(required.DATABASE_URL);
  });

  it('preserves development binding and explicit host settings', () => {
    expect(validateEnvironment(required).HOST).toBe('127.0.0.1');
    expect(validateEnvironment({ ...required, NODE_ENV: 'test' }).HOST).toBe('127.0.0.1');
    expect(
      validateEnvironment({ ...required, NODE_ENV: 'production', HOST: '127.0.0.2' }).HOST,
    ).toBe('127.0.0.2');
  });

  it('continues to reject invalid ports and shared signing secrets', () => {
    expect(() => validateEnvironment({ ...required, PORT: '0' })).toThrow('PORT');
    expect(() =>
      validateEnvironment({ ...required, JWT_REFRESH_SECRET: required.JWT_ACCESS_SECRET }),
    ).toThrow('JWT_REFRESH_SECRET');
  });
});

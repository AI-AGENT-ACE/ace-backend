import { validateEnvironment } from './environment';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://ace:password@127.0.0.1:55432/ace',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
};

describe('validateEnvironment auth capture mode', () => {
  it('shortens only the access-token lifetime in development', () => {
    const environment = validateEnvironment({
      ...requiredEnvironment,
      NODE_ENV: 'development',
      AUTH_CAPTURE_MODE: 'true',
    });

    expect(environment.JWT_ACCESS_EXPIRES_IN).toBe(15);
    expect(environment.JWT_REFRESH_EXPIRES_IN).toBe(30 * 24 * 60 * 60);
  });

  it('rejects auth capture mode outside development', () => {
    expect(() =>
      validateEnvironment({
        ...requiredEnvironment,
        NODE_ENV: 'production',
        AUTH_CAPTURE_MODE: 'true',
      }),
    ).toThrow('AUTH_CAPTURE_MODE');
  });
});

export function localDatabases(env) {
  if (env.NODE_ENV === 'production')
    throw new Error('Local database tools cannot run in production.');
  let development, test;
  try {
    development = new URL(env.DATABASE_URL);
    test = new URL(env.TEST_DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL and TEST_DATABASE_URL must be valid local PostgreSQL URLs.');
  }
  for (const url of [development, test]) {
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !/^\/[a-z][a-z0-9_]*$/.test(url.pathname)
    )
      throw new Error('Only explicitly named local PostgreSQL databases are allowed.');
  }
  if (!test.pathname.endsWith('_test') || test.pathname === development.pathname)
    throw new Error('Test database must be distinct from development and end in _test.');
  if ((test.port || '5432') !== (development.port || '5432'))
    throw new Error('Expected the same local PostgreSQL instance.');
  return { development, test };
}

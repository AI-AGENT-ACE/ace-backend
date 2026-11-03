import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabases } from './local-database-policy.mjs';
const base = {
  DATABASE_URL: 'postgresql://localhost:5432/ace',
  TEST_DATABASE_URL: 'postgresql://127.0.0.1:5432/ace_test',
};
test('permits distinct development/test databases on the local instance', () => {
  assert.equal(localDatabases(base).test.pathname, '/ace_test');
});
test('refuses remote endpoints, production, identical databases and unsafe names', () => {
  for (const env of [
    { ...base, NODE_ENV: 'production' },
    { ...base, TEST_DATABASE_URL: 'postgresql://example.com/ace_test' },
    { ...base, DATABASE_URL: 'postgresql://example.com/ace' },
    { ...base, DATABASE_URL: base.TEST_DATABASE_URL },
    { ...base, TEST_DATABASE_URL: 'postgresql://localhost/ace' },
    { ...base, TEST_DATABASE_URL: 'postgresql://localhost:9999/ace_test' },
    { ...base, TEST_DATABASE_URL: 'invalid' },
  ])
    assert.throws(() => localDatabases(env));
});

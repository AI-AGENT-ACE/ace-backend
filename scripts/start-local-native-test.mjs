import 'dotenv/config';
import { localDatabases } from './local-database-policy.mjs';

// This explicit local entry point uses real authentication, permissions and PostgreSQL.
// No fixture routes, fake users or bypassed guards are registered.
localDatabases(process.env);
process.env.NODE_ENV = 'development';
process.env.HOST = '127.0.0.1';
process.env.PORT = '3001';
process.env.AI_SERVER_URL = '';
process.env.AI_SERVER_API_KEY = '';
console.log('Local Native test backend: http://127.0.0.1:3001 (AI disabled for this process only)');
await import('../dist/main.js');

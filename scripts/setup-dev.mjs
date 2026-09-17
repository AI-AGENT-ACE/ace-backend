import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  console.log('.env already exists; existing configuration was preserved.');
} else {
  const password = randomBytes(24).toString('hex');
  const source = readFileSync('.env.example', 'utf8')
    .replaceAll('REPLACE_ME', password)
    .replace('REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS', randomBytes(48).toString('hex'))
    .replace(
      'REPLACE_WITH_A_DIFFERENT_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',
      randomBytes(48).toString('hex'),
    );
  writeFileSync('.env', source, { mode: 0o600, flag: 'wx' });
  console.log('Created .env with random development credentials. No secrets were printed.');
}

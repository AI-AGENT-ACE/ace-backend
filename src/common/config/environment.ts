import { z } from 'zod';
import { CronTime } from 'cron';

const validCron = (value: string) => {
  try {
    new CronTime(value);
    return true;
  } catch {
    return false;
  }
};
const validTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

function seconds(value: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(value);
  if (!match) return NaN;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return Number(match[1]) * (multipliers[match[2] ?? 's'] ?? 1);
}
const duration = (fallback: string, maximum: number) =>
  z.string().default(fallback).transform(seconds).pipe(z.number().int().min(60).max(maximum));
const optionalUrl = z
  .union([z.literal(''), z.url()])
  .optional()
  .transform((v) => v || undefined);
const secret = z
  .string()
  .min(32)
  .refine((value) => !value.startsWith('REPLACE_'));
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    JWT_ACCESS_EXPIRES_IN: duration('15m', 3600),
    JWT_REFRESH_EXPIRES_IN: duration('30d', 90 * 86400),
    CORS_ORIGINS: z
      .string()
      .default(
        'http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,http://tauri.localhost,https://tauri.localhost',
      )
      .transform((v) =>
        v
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().refine((v) => v !== '*')).min(1)),
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    AI_SERVER_URL: optionalUrl,
    AI_SERVER_API_KEY: z.string().optional(),
    WEATHER_API_KEY: z.string().optional(),
    EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(10000),
    REQUEST_BODY_LIMIT: z.enum(['128kb', '256kb', '1mb']).default('128kb'),
    UPLOAD_DIR: z.string().min(1).default('./uploads'),
    MAX_UPLOAD_SIZE: z.coerce.number().int().min(1).max(26214400).default(26214400),
    MAX_FILES_PER_MESSAGE: z.coerce.number().int().min(1).max(5).default(5),
    TRASH_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    TRASH_CLEANUP_CRON: z.string().min(5).max(100).default('0 3 * * *').refine(validCron),
    TRASH_CLEANUP_TIME_ZONE: z.string().min(1).max(100).default('Asia/Seoul').refine(validTimeZone),
    TRASH_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(100).max(500).default(250),
    TRASH_CLEANUP_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    RATE_LIMIT_TTL: z.coerce.number().int().min(1000).max(3600000).default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(120),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  })
  .superRefine((env, context) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'Secrets must differ.',
      });
    }
    if (env.JWT_REFRESH_EXPIRES_IN <= env.JWT_ACCESS_EXPIRES_IN) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_EXPIRES_IN'],
        message: 'Refresh lifetime must be longer.',
      });
    }
    if (env.AI_SERVER_URL) {
      const url = new URL(env.AI_SERVER_URL);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        context.addIssue({
          code: 'custom',
          path: ['AI_SERVER_URL'],
          message: 'Use a plain HTTP(S) service URL.',
        });
      }
    }
  });

export function validateEnvironment(input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
  }
  return result.data;
}

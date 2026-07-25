import 'dotenv/config';

import { z } from 'zod';

const durationPattern = /^\d+[smhd]$/;

function durationToSeconds(duration: string): number {
  const value = Number.parseInt(duration.slice(0, -1), 10);
  const unit = duration.at(-1);
  const multiplier = unit === 'd' ? 86_400 : unit === 'h' ? 3_600 : unit === 'm' ? 60 : 1;

  return value * multiplier;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_ACCESS_TTL: z
    .string()
    .regex(durationPattern)
    .refine((duration) => durationToSeconds(duration) > 0, 'JWT_ACCESS_TTL must be positive')
    .default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formattedErrors = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid environment configuration: ${formattedErrors}`);
}

export const env = {
  ...parsedEnv.data,
  JWT_ACCESS_TTL_SECONDS: durationToSeconds(parsedEnv.data.JWT_ACCESS_TTL),
};

export type Env = typeof env;

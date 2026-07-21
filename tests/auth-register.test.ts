import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { createApp } from '../src/app.js';

type App = ReturnType<typeof createApp>;

interface RegisterResponse {
  id: string;
  email: string;
  isEmailVerified: boolean;
  profile: {
    displayName: string | null;
    timeZone: string;
  };
  settings: {
    startOfWeek: string;
    startupPage: string;
    locale: string;
    theme: string;
  };
  createdAt: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
  };
}

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/personal_platform_test';

let app: App;
let prisma: PrismaClient | undefined;
const createdEmails = new Set<string>();

function assertSafeTestDatabase(url: string): void {
  const databaseName = new URL(url).pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run auth integration tests against non-test database: ${databaseName}`);
  }
}

function runMigrations(): void {
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
    },
    shell: true,
    stdio: 'pipe',
  });
}

async function cleanupCreatedUsers(): Promise<void> {
  if (!createdEmails.size || !prisma) {
    return;
  }

  await prisma.user.deleteMany({
    where: {
      email: {
        in: [...createdEmails],
      },
    },
  });
  createdEmails.clear();
}

describe('auth register', () => {
  beforeAll(async () => {
    assertSafeTestDatabase(testDatabaseUrl);
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4000';
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.TEST_DATABASE_URL = testDatabaseUrl;
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'silent';
    process.env.BCRYPT_SALT_ROUNDS = '10';
    process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = '60';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    runMigrations();

    const appModule = await import('../src/app.js');
    app = appModule.createApp();
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDatabaseUrl,
        },
      },
    });
  });

  beforeEach(async () => {
    await cleanupCreatedUsers();
  });

  afterAll(async () => {
    await cleanupCreatedUsers();
    await prisma?.$disconnect();
  });

  it('registers a user and creates profile, settings, and email verification token hash', async () => {
    const email = `Vitya.${Date.now()}@Example.COM`;
    const normalizedEmail = email.toLowerCase();
    createdEmails.add(normalizedEmail);

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'StrongPassword1!',
        displayName: ' Vitya ',
      })
      .expect(201);

    const body = response.body as RegisterResponse;

    expect(body).toMatchObject({
      email: normalizedEmail,
      isEmailVerified: false,
      profile: {
        displayName: 'Vitya',
        timeZone: 'Europe/Kyiv',
      },
      settings: {
        startOfWeek: 'MONDAY',
        startupPage: 'DASHBOARD',
        locale: 'UK',
        theme: 'SYSTEM',
      },
    });
    expect(body.id).toEqual(expect.any(String));
    expect(body.createdAt).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('passwordHash');

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        profile: true,
        settings: true,
        emailVerificationTokens: true,
      },
    });

    expect(user).not.toBeNull();
    expect(user?.profile).toMatchObject({
      displayName: 'Vitya',
      timeZone: 'Europe/Kyiv',
    });
    expect(user?.settings).toMatchObject({
      startOfWeek: 'MONDAY',
      startupPage: 'DASHBOARD',
      locale: 'UK',
      theme: 'SYSTEM',
    });
    expect(user?.passwordHash).not.toBe('StrongPassword1!');
    expect(user?.passwordHash).toEqual(expect.stringMatching(/^\$2[aby]\$/));
    expect(user?.emailVerificationTokens).toHaveLength(1);
    expect(user?.emailVerificationTokens[0]?.tokenHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));

    expect(response.body).not.toHaveProperty('verificationToken');
    expect(response.body).not.toHaveProperty('tokenHash');
  });

  it('returns 409 when email is already in use', async () => {
    const email = `duplicate.${Date.now()}@example.com`;
    createdEmails.add(email);

    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'StrongPassword1!',
      })
      .expect(201);

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: email.toUpperCase(),
        password: 'StrongPassword1!',
      })
      .expect(409);

    const body = response.body as ErrorResponse;

    expect(body.error).toMatchObject({
      code: 'EMAIL_ALREADY_IN_USE',
      message: 'Email is already in use',
      details: [],
    });

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        emailVerificationTokens: true,
      },
    });

    expect(user?.emailVerificationTokens).toHaveLength(1);
  });

  it('returns 400 for invalid email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'not-an-email',
        password: 'StrongPassword1!',
      })
      .expect(400);

    const body = response.body as ErrorResponse;

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it('returns 400 for weak password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `weak.${Date.now()}@example.com`,
        password: 'password',
      })
      .expect(400);

    const body = response.body as ErrorResponse;

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
    );
  });
});

describe('PasswordService', () => {
  it('hashes and compares passwords', async () => {
    process.env.BCRYPT_SALT_ROUNDS = '10';
    const { PasswordService } = await import('../src/modules/auth/password.service.js');
    const service = new PasswordService();
    const hash = await service.hash('StrongPassword1!');

    expect(hash).not.toBe('StrongPassword1!');
    await expect(service.compare('StrongPassword1!', hash)).resolves.toBe(true);
    await expect(service.compare('WrongPassword1!', hash)).resolves.toBe(false);
  });
});

describe('EmailVerificationService', () => {
  it('generates a raw token but stores only a SHA-256 hash shape', async () => {
    const { EmailVerificationService } = await import('../src/modules/auth/email-verification.service.js');
    const service = new EmailVerificationService();
    const token = service.generateToken();

    expect(token.rawToken).toEqual(expect.any(String));
    expect(token.tokenHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(token.tokenHash).not.toBe(token.rawToken);
  });
});
import type { AuthSession } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { AppError } from '../src/common/errors/app-error.js';
import { ErrorCodes } from '../src/common/errors/error-codes.js';
import { eventBus } from '../src/infrastructure/events/event-bus.js';
import { AuthRepository, type LoginUserRecord } from '../src/modules/auth/auth.repository.js';
import { loginBodySchema } from '../src/modules/auth/auth.schemas.js';
import { authService, AuthService } from '../src/modules/auth/auth.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { hashToken, tokenService } from '../src/modules/auth/token.service.js';

const now = new Date();
const loginUser: LoginUserRecord = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'password-hash',
  role: 'USER',
  isEmailVerified: true,
  createdAt: now,
  updatedAt: now,
  profile: {
    id: 'profile-1',
    userId: 'user-1',
    displayName: 'Test User',
    avatarUrl: null,
    timeZone: 'Europe/Kyiv',
    createdAt: now,
    updatedAt: now,
  },
  settings: {
    id: 'settings-1',
    userId: 'user-1',
    startOfWeek: 'MONDAY',
    startupPage: 'DASHBOARD',
    locale: 'UK',
    theme: 'SYSTEM',
    notificationsEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    createdAt: now,
    updatedAt: now,
  },
};

const authSession: AuthSession = {
  id: 'session-1',
  userId: loginUser.id,
  refreshTokenHash: 'refresh-token-hash',
  expiresAt: new Date(Date.now() + 30 * 86_400_000),
  revokedAt: null,
  userAgent: 'test-agent',
  ipAddress: '127.0.0.1',
  createdAt: now,
  updatedAt: now,
};

function createSubject(user: LoginUserRecord | null = loginUser) {
  const repository = new AuthRepository();
  const passwords = new PasswordService();
  const findLoginUserByEmail = vi.spyOn(repository, 'findLoginUserByEmail').mockResolvedValue(user);
  const createAuthSession = vi
    .spyOn(repository, 'createAuthSession')
    .mockResolvedValue(authSession);
  const deleteAuthSession = vi.spyOn(repository, 'deleteAuthSession').mockResolvedValue(undefined);
  const compare = vi.spyOn(passwords, 'compare').mockResolvedValue(true);
  const service = new AuthService(repository, passwords);

  return {
    service,
    findLoginUserByEmail,
    createAuthSession,
    deleteAuthSession,
    compare,
  };
}

function decodeJwtPayload(token: string): unknown {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) {
    throw new Error('JWT payload is missing');
  }

  return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown;
}

describe('login validation', () => {
  it.each([
    {},
    { email: '', password: 'password' },
    { email: 'user@example.com', password: '' },
    { email: 'user@example.com' },
    { password: 'password' },
  ])('rejects missing or empty credentials: %j', (body) => {
    expect(loginBodySchema.safeParse(body).success).toBe(false);
  });

  it('normalizes email without applying registration password rules', () => {
    expect(loginBodySchema.parse({ email: ' USER@Example.COM ', password: 'x' })).toEqual({
      email: 'user@example.com',
      password: 'x',
    });
  });
});

describe('POST /api/v1/auth/login', () => {
  const app = createApp();

  it('returns 200 for a valid login', async () => {
    const login = vi.spyOn(authService, 'login').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: loginUser.id,
        email: loginUser.email,
        role: loginUser.role,
        isEmailVerified: true,
        profile: {
          displayName: loginUser.profile?.displayName ?? '',
          avatarUrl: loginUser.profile?.avatarUrl ?? null,
          timeZone: loginUser.profile?.timeZone ?? '',
        },
        settings: {
          startOfWeek: loginUser.settings?.startOfWeek ?? 'MONDAY',
          startupPage: loginUser.settings?.startupPage ?? 'DASHBOARD',
          locale: loginUser.settings?.locale ?? 'UK',
          theme: loginUser.settings?.theme ?? 'SYSTEM',
        },
      },
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ' USER@Example.COM ', password: 'x' })
      .expect(200);

    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        password: 'x',
      }),
    );
    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { email: 'user@example.com' },
    });
  });

  it.each([{}, { email: '', password: 'password' }, { email: 'user@example.com', password: '' }])(
    'returns 400 VALIDATION_ERROR for invalid credentials: %j',
    async (body) => {
      const response = await request(app).post('/api/v1/auth/login').send(body).expect(400);
      const responseBody = z
        .object({
          error: z.object({
            code: z.string(),
            message: z.string(),
            requestId: z.string(),
          }),
        })
        .parse(response.body);

      expect(responseBody).toMatchObject({
        error: {
          code: ErrorCodes.ValidationError,
          message: 'Request validation failed',
        },
      });
      expect(responseBody.error.requestId).not.toHaveLength(0);
    },
  );
});

describe('AuthService.login', () => {
  it('creates a session and returns safe tokens, profile, settings, and access claims', async () => {
    const subject = createSubject();
    const publish = vi.spyOn(eventBus, 'publish');

    const result = await subject.service.login({
      email: ' USER@Example.COM ',
      password: 'submitted-password',
      userAgent: 'test-agent',
      ipAddress: '127.0.0.1',
    });

    expect(subject.findLoginUserByEmail).toHaveBeenCalledWith('user@example.com');
    expect(subject.compare).toHaveBeenCalledWith('submitted-password', 'password-hash');
    expect(subject.createAuthSession).toHaveBeenCalledOnce();
    const sessionInput = subject.createAuthSession.mock.calls[0]?.[0];
    expect(sessionInput).toMatchObject({
      userId: 'user-1',
      refreshTokenHash: hashToken(result.refreshToken),
      userAgent: 'test-agent',
      ipAddress: '127.0.0.1',
    });
    expect(sessionInput?.expiresAt).toBeInstanceOf(Date);
    expect(sessionInput?.refreshTokenHash).not.toBe(result.refreshToken);
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(decodeJwtPayload(result.accessToken)).toMatchObject({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      sessionId: 'session-1',
      type: 'access',
    });
    expect(result.expiresIn).toBe(900);
    expect(result.user).toMatchObject({
      profile: {
        displayName: 'Test User',
        avatarUrl: null,
        timeZone: 'Europe/Kyiv',
      },
      settings: {
        startOfWeek: 'MONDAY',
        startupPage: 'DASHBOARD',
        locale: 'UK',
        theme: 'SYSTEM',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|refreshTokenHash|revokedAt|userAgent|ipAddress/,
    );
    expect(publish.mock.calls[0]?.[0]).toBe('auth.user_logged_in');
    expect(publish.mock.calls[0]?.[1]).toMatchObject({
      userId: 'user-1',
      email: 'user@example.com',
      sessionId: 'session-1',
    });
  });

  it.each([
    ['unknown email', null, true],
    ['OAuth-only user', { ...loginUser, passwordHash: null }, true],
    ['wrong password', loginUser, false],
  ])('returns generic invalid credentials for %s', async (_name, user, passwordMatches) => {
    const subject = createSubject(user);
    subject.compare.mockResolvedValue(passwordMatches);

    await expect(
      subject.service.login({ email: 'user@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({
      code: ErrorCodes.InvalidCredentials,
      message: 'Invalid email or password',
      statusCode: 401,
    } satisfies Partial<AppError>);
    expect(subject.createAuthSession).not.toHaveBeenCalled();
  });

  it('rejects an unverified user without creating a session', async () => {
    const subject = createSubject({ ...loginUser, isEmailVerified: false });

    await expect(
      subject.service.login({ email: loginUser.email, password: 'password' }),
    ).rejects.toMatchObject({
      code: ErrorCodes.EmailNotVerified,
      message: 'Email address is not verified',
      statusCode: 403,
    } satisfies Partial<AppError>);
    expect(subject.createAuthSession).not.toHaveBeenCalled();
  });

  it('returns no result when session creation fails', async () => {
    const subject = createSubject();
    subject.createAuthSession.mockRejectedValueOnce(new Error('database failed'));
    const signAccessToken = vi.spyOn(tokenService, 'signAccessToken');

    await expect(
      subject.service.login({ email: loginUser.email, password: 'password' }),
    ).rejects.toThrow('database failed');
    expect(signAccessToken).not.toHaveBeenCalled();
  });

  it('deletes a new session when access-token signing fails', async () => {
    const subject = createSubject();
    vi.spyOn(tokenService, 'signAccessToken').mockImplementationOnce(() => {
      throw new Error('signing failed');
    });

    await expect(
      subject.service.login({ email: loginUser.email, password: 'password' }),
    ).rejects.toThrow('signing failed');
    expect(subject.deleteAuthSession).toHaveBeenCalledWith('session-1');
  });

  it('keeps login successful when an EventBus listener fails', async () => {
    const unsubscribe = eventBus.subscribe('auth.user_logged_in', () => {
      throw new Error('listener failed');
    });
    const subject = createSubject();

    try {
      await expect(
        subject.service.login({ email: loginUser.email, password: 'password' }),
      ).resolves.toMatchObject({ tokenType: 'Bearer' });
    } finally {
      unsubscribe();
    }
  });
});

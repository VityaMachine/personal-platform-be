import type { AuthSession } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { AppError } from '../src/common/errors/app-error.js';
import { ErrorCodes } from '../src/common/errors/error-codes.js';
import { eventBus } from '../src/infrastructure/events/event-bus.js';
import { logger } from '../src/infrastructure/logger/logger.js';
import {
  AuthRepository,
  type LoginUserRecord,
  type RefreshSessionRecord,
} from '../src/modules/auth/auth.repository.js';
import { refreshBodySchema } from '../src/modules/auth/auth.schemas.js';
import { authService, AuthService } from '../src/modules/auth/auth.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { hashToken, tokenService } from '../src/modules/auth/token.service.js';

const now = new Date();
const refreshUser: LoginUserRecord = {
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

function makeSession(
  refreshTokenHash: string,
  overrides: Partial<AuthSession> = {},
): RefreshSessionRecord {
  return {
    id: 'session-1',
    userId: refreshUser.id,
    refreshTokenHash,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    userAgent: 'old-agent',
    ipAddress: '10.0.0.1',
    createdAt: now,
    updatedAt: now,
    user: refreshUser,
    ...overrides,
  };
}

function createSubject(rawToken = 'old-refresh-token', session = makeSession(hashToken(rawToken))) {
  let storedSession = session;
  const repository = new AuthRepository();
  const findRefreshSessionByHash = vi
    .spyOn(repository, 'findRefreshSessionByHash')
    .mockImplementation((tokenHash) =>
      Promise.resolve(storedSession.refreshTokenHash === tokenHash ? storedSession : null),
    );
  const rotateAuthSessionAtomically = vi
    .spyOn(repository, 'rotateAuthSessionAtomically')
    .mockImplementation(async (input, beforeCommit) => {
      if (
        storedSession.id !== input.sessionId ||
        storedSession.refreshTokenHash !== input.currentRefreshTokenHash ||
        storedSession.revokedAt ||
        storedSession.expiresAt.getTime() <= input.rotatedAt.getTime()
      ) {
        return null;
      }

      const previousSession = storedSession;
      storedSession = {
        ...storedSession,
        refreshTokenHash: input.nextRefreshTokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        updatedAt: input.rotatedAt,
      };
      try {
        return await beforeCommit();
      } catch (error) {
        storedSession = previousSession;
        throw error;
      }
    });
  const service = new AuthService(repository, new PasswordService());

  return {
    service,
    findRefreshSessionByHash,
    rotateAuthSessionAtomically,
    getStoredSession: () => storedSession,
  };
}

function decodeJwtPayload(token: string): unknown {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) {
    throw new Error('JWT payload is missing');
  }

  return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown;
}

describe('refresh validation', () => {
  it.each([{}, { refreshToken: '' }, { refreshToken: '   ' }])(
    'rejects missing or blank tokens: %j',
    (body) => {
      expect(refreshBodySchema.safeParse(body).success).toBe(false);
    },
  );

  it('trims a valid refresh token', () => {
    expect(refreshBodySchema.parse({ refreshToken: ' token ' })).toEqual({
      refreshToken: 'token',
    });
  });
});

describe('POST /api/v1/auth/refresh', () => {
  const app = createApp();

  it('returns 200 with the rotated token response', async () => {
    const refresh = vi.spyOn(authService, 'refresh').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'new-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: refreshUser.id,
        email: refreshUser.email,
        role: refreshUser.role,
        isEmailVerified: true,
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
      },
    });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('user-agent', 'current-agent')
      .send({ refreshToken: ' old-token ' })
      .expect(200);

    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'old-token',
        userAgent: 'current-agent',
      }),
    );
    expect(response.body).toMatchObject({
      refreshToken: 'new-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  });

  it.each([{}, { refreshToken: '' }, { refreshToken: '   ' }])(
    'returns 400 VALIDATION_ERROR for an invalid body: %j',
    async (body) => {
      const response = await request(app).post('/api/v1/auth/refresh').send(body).expect(400);
      const responseBody = z
        .object({
          error: z.object({
            code: z.string(),
            requestId: z.string().min(1),
          }),
        })
        .parse(response.body);

      expect(responseBody.error.code).toBe(ErrorCodes.ValidationError);
    },
  );
});

describe('AuthService.refresh', () => {
  it('hashes, rotates, extends, preserves the session, and returns safe access claims', async () => {
    const rawToken = 'old-refresh-token';
    const subject = createSubject(rawToken);
    const publish = vi.spyOn(eventBus, 'publish');

    const result = await subject.service.refresh({
      refreshToken: rawToken,
      userAgent: 'new-agent',
      ipAddress: '127.0.0.1',
    });

    expect(subject.findRefreshSessionByHash).toHaveBeenCalledWith(hashToken(rawToken));
    const rotation = subject.rotateAuthSessionAtomically.mock.calls[0]?.[0];
    expect(rotation).toMatchObject({
      sessionId: 'session-1',
      currentRefreshTokenHash: hashToken(rawToken),
      nextRefreshTokenHash: hashToken(result.refreshToken),
      userAgent: 'new-agent',
      ipAddress: '127.0.0.1',
    });
    expect(rotation?.nextRefreshTokenHash).not.toBe(result.refreshToken);
    expect(rotation?.expiresAt.getTime()).toBeGreaterThan(
      makeSession(hashToken(rawToken)).expiresAt.getTime(),
    );
    expect(subject.getStoredSession()).toMatchObject({
      id: 'session-1',
      refreshTokenHash: hashToken(result.refreshToken),
      userAgent: 'new-agent',
      ipAddress: '127.0.0.1',
    });
    expect(decodeJwtPayload(result.accessToken)).toMatchObject({
      sub: refreshUser.id,
      email: refreshUser.email,
      role: refreshUser.role,
      sessionId: 'session-1',
      type: 'access',
    });
    expect(result.expiresIn).toBe(900);
    expect(result.user).toMatchObject({
      profile: { displayName: 'Test User', avatarUrl: null, timeZone: 'Europe/Kyiv' },
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
    expect(publish.mock.calls[0]?.[0]).toBe('auth.session_refreshed');
    expect(publish.mock.calls[0]?.[1]).toMatchObject({
      userId: refreshUser.id,
      email: refreshUser.email,
      sessionId: 'session-1',
    });
  });

  it('invalidates the old token and allows the new token to rotate next', async () => {
    const subject = createSubject();
    const first = await subject.service.refresh({ refreshToken: 'old-refresh-token' });

    await expect(
      subject.service.refresh({ refreshToken: 'old-refresh-token' }),
    ).rejects.toMatchObject({
      code: ErrorCodes.InvalidRefreshToken,
      statusCode: 401,
    } satisfies Partial<AppError>);

    const second = await subject.service.refresh({ refreshToken: first.refreshToken });
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(subject.getStoredSession().refreshTokenHash).toBe(hashToken(second.refreshToken));
  });

  it.each([
    ['unknown', null],
    ['revoked', makeSession(hashToken('token'), { revokedAt: new Date() })],
    ['expired', makeSession(hashToken('token'), { expiresAt: new Date(Date.now() - 1_000) })],
  ])('returns generic invalid refresh token for an %s session', async (_name, session) => {
    const subject = createSubject('token', session ?? makeSession(hashToken('different')));

    await expect(subject.service.refresh({ refreshToken: 'token' })).rejects.toMatchObject({
      code: ErrorCodes.InvalidRefreshToken,
      message: 'Invalid refresh token',
      statusCode: 401,
    } satisfies Partial<AppError>);
    expect(subject.rotateAuthSessionAtomically).not.toHaveBeenCalled();
  });

  it('allows only one concurrent rotation of the same token', async () => {
    const subject = createSubject();
    const results = await Promise.allSettled([
      subject.service.refresh({ refreshToken: 'old-refresh-token' }),
      subject.service.refresh({ refreshToken: 'old-refresh-token' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find((result) => result.status === 'rejected');
    expect(rejection).toMatchObject({
      reason: { code: ErrorCodes.InvalidRefreshToken, statusCode: 401 },
    });
  });

  it('does not rotate for an unverified user', async () => {
    const session = makeSession(hashToken('token'));
    session.user = { ...refreshUser, isEmailVerified: false };
    const subject = createSubject('token', session);

    await expect(subject.service.refresh({ refreshToken: 'token' })).rejects.toMatchObject({
      code: ErrorCodes.EmailNotVerified,
      statusCode: 403,
    } satisfies Partial<AppError>);
    expect(subject.rotateAuthSessionAtomically).not.toHaveBeenCalled();
  });

  it('keeps the previous token valid when access-token signing fails', async () => {
    const subject = createSubject();
    vi.spyOn(tokenService, 'signAccessToken').mockImplementationOnce(() => {
      throw new Error('signing failed');
    });

    await expect(subject.service.refresh({ refreshToken: 'old-refresh-token' })).rejects.toThrow(
      'signing failed',
    );
    await expect(
      subject.service.refresh({ refreshToken: 'old-refresh-token' }),
    ).resolves.toMatchObject({ tokenType: 'Bearer' });
  });

  it('returns no tokens and leaves the old token valid when persistence fails', async () => {
    const subject = createSubject();
    subject.rotateAuthSessionAtomically.mockRejectedValueOnce(new Error('database failed'));

    await expect(subject.service.refresh({ refreshToken: 'old-refresh-token' })).rejects.toThrow(
      'database failed',
    );
    await expect(
      subject.service.refresh({ refreshToken: 'old-refresh-token' }),
    ).resolves.toMatchObject({ tokenType: 'Bearer' });
  });

  it('keeps refresh successful when an EventBus listener fails', async () => {
    const unsubscribe = eventBus.subscribe('auth.session_refreshed', () => {
      throw new Error('listener failed');
    });
    const subject = createSubject();

    try {
      await expect(
        subject.service.refresh({ refreshToken: 'old-refresh-token' }),
      ).resolves.toMatchObject({ tokenType: 'Bearer' });
    } finally {
      unsubscribe();
    }
  });

  it('does not log raw refresh tokens', async () => {
    const rawToken = 'raw-token-that-must-not-be-logged';
    const errorLog = vi.spyOn(logger, 'error');
    const infoLog = vi.spyOn(logger, 'info');
    const warnLog = vi.spyOn(logger, 'warn');
    const subject = createSubject(rawToken);

    await subject.service.refresh({ refreshToken: rawToken });

    expect(
      JSON.stringify([errorLog.mock.calls, infoLog.mock.calls, warnLog.mock.calls]),
    ).not.toContain(rawToken);
  });
});

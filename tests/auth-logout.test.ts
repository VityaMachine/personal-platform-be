import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { ErrorCodes } from '../src/common/errors/error-codes.js';
import { eventBus } from '../src/infrastructure/events/event-bus.js';
import { logger } from '../src/infrastructure/logger/logger.js';
import { authRepository, AuthRepository } from '../src/modules/auth/auth.repository.js';
import { logoutBodySchema } from '../src/modules/auth/auth.schemas.js';
import { authService, AuthService } from '../src/modules/auth/auth.service.js';
import { hashToken, tokenService } from '../src/modules/auth/token.service.js';

function accessToken(userId: string, sessionId: string): string {
  return tokenService.signAccessToken({
    sub: userId,
    email: `${userId}@example.com`,
    role: 'USER',
    sessionId,
    type: 'access',
  });
}

function expectErrorCode(responseBody: unknown, code: string): void {
  const body = z
    .object({ error: z.object({ code: z.string(), requestId: z.string().min(1) }) })
    .parse(responseBody);
  expect(body.error.code).toBe(code);
}

function createSubject() {
  const repository = new AuthRepository();
  const revokeActiveRefreshSessionForUser = vi
    .spyOn(repository, 'revokeActiveRefreshSessionForUser')
    .mockResolvedValue(null);
  const service = new AuthService(repository);

  return { service, revokeActiveRefreshSessionForUser };
}

describe('logout validation', () => {
  it.each([{}, { refreshToken: '' }, { refreshToken: '   ' }])(
    'rejects missing or blank tokens: %j',
    (body) => {
      expect(logoutBodySchema.safeParse(body).success).toBe(false);
    },
  );

  it('trims a valid refresh token', () => {
    expect(logoutBodySchema.parse({ refreshToken: ' token ' })).toEqual({
      refreshToken: 'token',
    });
  });
});

describe('POST /api/v1/auth/logout', () => {
  const app = createApp();

  it('passes only the authenticated user ID and validated refresh token to the service', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue({
      id: 'session-a',
      userId: 'user-a',
    });
    const logout = vi.spyOn(authService, 'logout').mockResolvedValue();

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${accessToken('user-a', 'session-a')}`)
      .send({ refreshToken: ' token ', userId: 'user-b' })
      .expect(204);

    expect(logout).toHaveBeenCalledWith({ userId: 'user-a', refreshToken: 'token' });
    expect(response.text).toBe('');
    expect(response.body).toEqual({});
    expect(response.headers['content-type']).toBeUndefined();
  });

  it('returns 401 when the access token is missing', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'token' })
      .expect(401);
    expectErrorCode(response.body, ErrorCodes.Unauthorized);
  });

  it('returns 401 when the access token is invalid', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', 'Bearer invalid')
      .send({ refreshToken: 'token' })
      .expect(401);
    expectErrorCode(response.body, ErrorCodes.Unauthorized);
  });

  it.each(['revoked', 'deleted', 'expired'])(
    'returns 401 when the access token references a %s AuthSession',
    async () => {
      vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue(null);
      const logout = vi.spyOn(authService, 'logout');
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('authorization', `Bearer ${accessToken('user-a', 'inactive-session')}`)
        .send({ refreshToken: 'token' })
        .expect(401);

      expectErrorCode(response.body, ErrorCodes.Unauthorized);
      expect(logout).not.toHaveBeenCalled();
    },
  );

  it('authenticates before validating the refresh-token body', async () => {
    const response = await request(app).post('/api/v1/auth/logout').send({}).expect(401);
    expectErrorCode(response.body, ErrorCodes.Unauthorized);
  });

  it('preserves body validation after authentication', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue({
      id: 'session-a',
      userId: 'user-a',
    });
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${accessToken('user-a', 'session-a')}`)
      .send({})
      .expect(400);
    expectErrorCode(response.body, ErrorCodes.ValidationError);
  });

  it('passes repository failures to the global error handler', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue({
      id: 'session-a',
      userId: 'user-a',
    });
    vi.spyOn(authService, 'logout').mockRejectedValueOnce(new Error('database failed'));

    await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${accessToken('user-a', 'session-a')}`)
      .send({ refreshToken: 'token' })
      .expect(500);
  });

  it('invalidates only the access token for the successfully logged-out session', async () => {
    const sessions = new Map([
      ['session-a1', 'user-a'],
      ['session-a2', 'user-a'],
      ['session-b1', 'user-b'],
    ]);
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockImplementation(
      (sessionId, userId) =>
        Promise.resolve(sessions.get(sessionId) === userId ? { id: sessionId, userId } : null),
    );
    vi.spyOn(authService, 'logout').mockImplementation(({ userId }) => {
      if (userId === 'user-a') sessions.delete('session-a1');
      return Promise.resolve();
    });
    const tokenA1 = accessToken('user-a', 'session-a1');
    const tokenA2 = accessToken('user-a', 'session-a2');
    const tokenB1 = accessToken('user-b', 'session-b1');

    await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${tokenA1}`)
      .send({ refreshToken: 'refresh-a1' })
      .expect(204);
    await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${tokenA1}`)
      .send({ refreshToken: 'refresh-a1' })
      .expect(401);
    await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${tokenA2}`)
      .send({ refreshToken: 'refresh-a2' })
      .expect(204);
    await request(app)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${tokenB1}`)
      .send({ refreshToken: 'refresh-b1' })
      .expect(204);
  });
});

describe('AuthService.logout', () => {
  it('hashes the token, enforces ownership, revokes, and then publishes', async () => {
    const rawToken = 'raw-refresh-token';
    const subject = createSubject();
    const revokedAt = new Date('2026-07-26T12:00:00.000Z');
    subject.revokeActiveRefreshSessionForUser.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      revokedAt,
    });
    const publish = vi.spyOn(eventBus, 'publish');

    await subject.service.logout({ userId: 'user-1', refreshToken: rawToken });

    const input = subject.revokeActiveRefreshSessionForUser.mock.calls[0]?.[0];
    expect(input).toMatchObject({ userId: 'user-1', refreshTokenHash: hashToken(rawToken) });
    expect(input?.refreshTokenHash).not.toBe(rawToken);
    expect(input?.revokedAt).toBeInstanceOf(Date);
    expect(publish).toHaveBeenCalledWith('auth.user_logged_out', {
      userId: 'user-1',
      sessionId: 'session-1',
      loggedOutAt: revokedAt.toISOString(),
    });
  });

  it.each(['unknown', 'revoked', 'expired', 'rotated', 'owned by another user'])(
    'returns the generic invalid-refresh-token error for a token that is %s',
    async () => {
      const subject = createSubject();
      const publish = vi.spyOn(eventBus, 'publish');

      await expect(
        subject.service.logout({ userId: 'user-1', refreshToken: 'token' }),
      ).rejects.toMatchObject({ code: ErrorCodes.InvalidRefreshToken, statusCode: 401 });
      expect(publish).not.toHaveBeenCalled();
    },
  );

  it('reproduces and prevents cross-user revocation', async () => {
    const sessions = new Map<string, { id: string; userId: string; revokedAt: Date | null }>([
      [hashToken('refresh-a'), { id: 'session-a', userId: 'user-a', revokedAt: null }],
      [hashToken('refresh-b'), { id: 'session-b', userId: 'user-b', revokedAt: null }],
    ]);
    const subject = createSubject();
    subject.revokeActiveRefreshSessionForUser.mockImplementation((input) => {
      const session = sessions.get(input.refreshTokenHash);
      if (session?.userId !== input.userId || session.revokedAt)
        return Promise.resolve(null);
      session.revokedAt = input.revokedAt;
      return Promise.resolve({ ...session, revokedAt: input.revokedAt });
    });
    const publish = vi.spyOn(eventBus, 'publish');

    await expect(
      subject.service.logout({ userId: 'user-b', refreshToken: 'refresh-a' }),
    ).rejects.toMatchObject({ code: ErrorCodes.InvalidRefreshToken, statusCode: 401 });

    expect(sessions.get(hashToken('refresh-a'))?.revokedAt).toBeNull();
    expect(sessions.get(hashToken('refresh-b'))?.revokedAt).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });

  it('allows only one concurrent request to revoke and publish', async () => {
    const subject = createSubject();
    let active = true;
    subject.revokeActiveRefreshSessionForUser.mockImplementation((input) => {
      if (!active) return Promise.resolve(null);
      active = false;
      return Promise.resolve({
        id: 'session-1',
        userId: input.userId,
        revokedAt: input.revokedAt,
      });
    });
    const publish = vi.spyOn(eventBus, 'publish');

    const results = await Promise.allSettled([
      subject.service.logout({ userId: 'user-1', refreshToken: 'same-token' }),
      subject.service.logout({ userId: 'user-1', refreshToken: 'same-token' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('keeps logout successful when an EventBus listener fails', async () => {
    const subject = createSubject();
    subject.revokeActiveRefreshSessionForUser.mockImplementation((input) =>
      Promise.resolve({
        id: 'session-1',
        userId: input.userId,
        revokedAt: input.revokedAt,
      }),
    );
    const unsubscribe = eventBus.subscribe('auth.user_logged_out', () => {
      throw new Error('listener failed');
    });

    try {
      await expect(
        subject.service.logout({ userId: 'user-1', refreshToken: 'token' }),
      ).resolves.toBeUndefined();
    } finally {
      unsubscribe();
    }
  });

  it('propagates revocation failures and does not publish', async () => {
    const subject = createSubject();
    subject.revokeActiveRefreshSessionForUser.mockRejectedValue(new Error('database failed'));
    const publish = vi.spyOn(eventBus, 'publish');

    await expect(
      subject.service.logout({ userId: 'user-1', refreshToken: 'token' }),
    ).rejects.toThrow('database failed');
    expect(publish).not.toHaveBeenCalled();
  });

  it('never persists or logs the raw token', async () => {
    const rawToken = 'raw-token-that-must-not-be-persisted-or-logged';
    const subject = createSubject();
    const errorLog = vi.spyOn(logger, 'error');
    const infoLog = vi.spyOn(logger, 'info');
    const warnLog = vi.spyOn(logger, 'warn');

    await expect(
      subject.service.logout({ userId: 'user-1', refreshToken: rawToken }),
    ).rejects.toMatchObject({ code: ErrorCodes.InvalidRefreshToken });

    expect(JSON.stringify(subject.revokeActiveRefreshSessionForUser.mock.calls)).not.toContain(
      rawToken,
    );
    expect(
      JSON.stringify([errorLog.mock.calls, infoLog.mock.calls, warnLog.mock.calls]),
    ).not.toContain(rawToken);
  });
});

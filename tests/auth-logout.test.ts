import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { ErrorCodes } from '../src/common/errors/error-codes.js';
import { eventBus } from '../src/infrastructure/events/event-bus.js';
import { logger } from '../src/infrastructure/logger/logger.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { logoutBodySchema } from '../src/modules/auth/auth.schemas.js';
import { authService, AuthService } from '../src/modules/auth/auth.service.js';
import { hashToken } from '../src/modules/auth/token.service.js';

function createSubject() {
  const repository = new AuthRepository();
  const revokeActiveAuthSession = vi
    .spyOn(repository, 'revokeActiveAuthSession')
    .mockResolvedValue(null);
  const service = new AuthService(repository);

  return { service, revokeActiveAuthSession };
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

  it('returns an empty 204 response without exposing session data or tokens', async () => {
    const logout = vi.spyOn(authService, 'logout').mockResolvedValue();

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: ' token ' })
      .expect(204);

    expect(logout).toHaveBeenCalledWith({ refreshToken: 'token' });
    expect(response.text).toBe('');
    expect(response.body).toEqual({});
    expect(response.headers['content-type']).toBeUndefined();
  });

  it.each([{}, { refreshToken: '' }, { refreshToken: '   ' }])(
    'returns 400 VALIDATION_ERROR for an invalid body: %j',
    async (body) => {
      const response = await request(app).post('/api/v1/auth/logout').send(body).expect(400);
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

  it('returns a repository failure instead of a false 204', async () => {
    vi.spyOn(authService, 'logout').mockRejectedValueOnce(new Error('database failed'));

    await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'token' }).expect(500);
  });
});

describe('AuthService.logout', () => {
  it('hashes the raw token and publishes the revocation event', async () => {
    const rawToken = 'raw-refresh-token';
    const subject = createSubject();
    const revokedAt = new Date('2026-07-26T12:00:00.000Z');
    subject.revokeActiveAuthSession.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      revokedAt,
    });
    const publish = vi.spyOn(eventBus, 'publish');

    await subject.service.logout({ refreshToken: rawToken });

    const repositoryInput = subject.revokeActiveAuthSession.mock.calls[0]?.[0];
    expect(repositoryInput?.refreshTokenHash).toBe(hashToken(rawToken));
    expect(repositoryInput?.refreshTokenHash).not.toBe(rawToken);
    expect(repositoryInput?.revokedAt).toBeInstanceOf(Date);
    expect(publish).toHaveBeenCalledWith('auth.user_logged_out', {
      userId: 'user-1',
      sessionId: 'session-1',
      loggedOutAt: revokedAt.toISOString(),
    });
  });

  it.each(['unknown', 'already revoked', 'expired', 'previously rotated'])(
    'returns successfully and does not publish for an %s token',
    async () => {
      const subject = createSubject();
      const publish = vi.spyOn(eventBus, 'publish');

      await expect(subject.service.logout({ refreshToken: 'token' })).resolves.toBeUndefined();

      expect(subject.revokeActiveAuthSession).toHaveBeenCalledOnce();
      expect(publish).not.toHaveBeenCalled();
    },
  );

  it('allows only one concurrent request to perform and publish the revocation', async () => {
    const subject = createSubject();
    let active = true;
    subject.revokeActiveAuthSession.mockImplementation((input) => {
      if (!active) {
        return Promise.resolve(null);
      }
      active = false;
      return Promise.resolve({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: input.revokedAt,
      });
    });
    const publish = vi.spyOn(eventBus, 'publish');

    await expect(
      Promise.all([
        subject.service.logout({ refreshToken: 'same-token' }),
        subject.service.logout({ refreshToken: 'same-token' }),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('keeps logout successful when an EventBus listener fails', async () => {
    const subject = createSubject();
    subject.revokeActiveAuthSession.mockImplementation((input) =>
      Promise.resolve({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: input.revokedAt,
      }),
    );
    const unsubscribe = eventBus.subscribe('auth.user_logged_out', () => {
      throw new Error('listener failed');
    });

    try {
      await expect(subject.service.logout({ refreshToken: 'token' })).resolves.toBeUndefined();
    } finally {
      unsubscribe();
    }
  });

  it('propagates repository failures and does not publish', async () => {
    const subject = createSubject();
    subject.revokeActiveAuthSession.mockRejectedValue(new Error('database failed'));
    const publish = vi.spyOn(eventBus, 'publish');

    await expect(subject.service.logout({ refreshToken: 'token' })).rejects.toThrow(
      'database failed',
    );
    expect(publish).not.toHaveBeenCalled();
  });

  it('never persists or logs the raw token', async () => {
    const rawToken = 'raw-token-that-must-not-be-persisted-or-logged';
    const subject = createSubject();
    const errorLog = vi.spyOn(logger, 'error');
    const infoLog = vi.spyOn(logger, 'info');
    const warnLog = vi.spyOn(logger, 'warn');

    await subject.service.logout({ refreshToken: rawToken });

    expect(JSON.stringify(subject.revokeActiveAuthSession.mock.calls)).not.toContain(rawToken);
    expect(
      JSON.stringify([errorLog.mock.calls, infoLog.mock.calls, warnLog.mock.calls]),
    ).not.toContain(rawToken);
  });
});

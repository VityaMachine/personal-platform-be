import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { ErrorCodes } from '../src/common/errors/error-codes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { requestIdMiddleware } from '../src/common/middleware/request-id.js';
import { eventBus } from '../src/infrastructure/events/event-bus.js';
import { authRepository, AuthRepository } from '../src/modules/auth/auth.repository.js';
import { logoutAll as logoutAllController } from '../src/modules/auth/auth.controller.js';
import { authService, AuthService } from '../src/modules/auth/auth.service.js';
import { tokenService } from '../src/modules/auth/token.service.js';

function accessToken(userId = 'user-1'): string {
  return tokenService.signAccessToken({
    sub: userId,
    email: `${userId}@example.com`,
    role: 'USER',
    sessionId: 'session-1',
    type: 'access',
  });
}

function createSubject() {
  const sessions = [
    { id: 'session-1', userId: 'user-1', refreshToken: 'refresh-one' },
    { id: 'session-2', userId: 'user-1', refreshToken: 'refresh-two' },
    { id: 'session-3', userId: 'user-2', refreshToken: 'other-refresh' },
  ];
  const repository = new AuthRepository();
  const revokeAllSessions = vi
    .spyOn(repository, 'revokeAllSessions')
    .mockImplementation((userId) => {
      for (let index = sessions.length - 1; index >= 0; index -= 1) {
        if (sessions[index]?.userId === userId) {
          sessions.splice(index, 1);
        }
      }
      return Promise.resolve();
    });

  return {
    service: new AuthService(repository),
    sessions,
    revokeAllSessions,
  };
}

describe('POST /api/v1/auth/logout-all', () => {
  const app = createApp();

  it('returns an empty 204 and passes the authenticated user to the service', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
    });
    const logoutAll = vi.spyOn(authService, 'logoutAll').mockResolvedValue();

    const response = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${accessToken()}`)
      .expect(204);

    expect(logoutAll).toHaveBeenCalledWith('user-1');
    expect(response.text).toBe('');
    expect(response.headers['content-type']).toBeUndefined();
  });

  it('returns 401 when the access token is missing', async () => {
    const response = await request(app).post('/api/v1/auth/logout-all').expect(401);

    const body = z
      .object({ error: z.object({ code: z.string(), requestId: z.string().min(1) }) })
      .parse(response.body);
    expect(body.error.code).toBe(ErrorCodes.Unauthorized);
  });

  it('returns 401 when the access token is invalid', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('authorization', 'Bearer invalid-token')
      .expect(401);

    const body = z
      .object({ error: z.object({ code: z.string(), requestId: z.string().min(1) }) })
      .parse(response.body);
    expect(body.error.code).toBe(ErrorCodes.Unauthorized);
  });

  it('rejects access tokens for every deleted session while another user remains authenticated', async () => {
    const activeSessions = new Map([
      ['session-1', 'user-1'],
      ['session-2', 'user-1'],
      ['session-3', 'user-2'],
    ]);
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockImplementation(
      (sessionId, userId) =>
        Promise.resolve(
          activeSessions.get(sessionId) === userId ? { id: sessionId, userId } : null,
        ),
    );
    vi.spyOn(authService, 'logoutAll').mockImplementation((userId) => {
      for (const [sessionId, ownerId] of activeSessions) {
        if (ownerId === userId) {
          activeSessions.delete(sessionId);
        }
      }
      return Promise.resolve();
    });
    const firstToken = accessToken('user-1');
    const secondToken = tokenService.signAccessToken({
      sub: 'user-1',
      email: 'user-1@example.com',
      role: 'USER',
      sessionId: 'session-2',
      type: 'access',
    });
    const otherUserToken = tokenService.signAccessToken({
      sub: 'user-2',
      email: 'user-2@example.com',
      role: 'USER',
      sessionId: 'session-3',
      type: 'access',
    });

    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${firstToken}`)
      .expect(204);
    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${firstToken}`)
      .expect(401);
    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${secondToken}`)
      .expect(401);
    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${otherUserToken}`)
      .expect(204);
  });
});

describe('AuthService.logoutAll', () => {
  it('revokes every session for the current user and leaves other users untouched', async () => {
    const subject = createSubject();

    await subject.service.logoutAll('user-1');

    expect(subject.revokeAllSessions).toHaveBeenCalledWith('user-1');
    expect(subject.sessions).toEqual([
      { id: 'session-3', userId: 'user-2', refreshToken: 'other-refresh' },
    ]);
    expect(subject.sessions.some((session) => session.refreshToken === 'refresh-one')).toBe(false);
    expect(subject.sessions.some((session) => session.refreshToken === 'refresh-two')).toBe(false);
    expect(subject.sessions.some((session) => session.refreshToken === 'other-refresh')).toBe(true);
  });

  it('publishes auth.all_sessions_logged_out after revocation', async () => {
    const subject = createSubject();
    const publish = vi.spyOn(eventBus, 'publish');

    await subject.service.logoutAll('user-1');

    expect(subject.revokeAllSessions.mock.invocationCallOrder[0]).toBeLessThan(
      publish.mock.invocationCallOrder[0] ?? 0,
    );
    expect(publish.mock.calls[0]?.[0]).toBe('auth.all_sessions_logged_out');
    const payload = z
      .object({ userId: z.string(), occurredAt: z.string().datetime() })
      .parse(publish.mock.calls[0]?.[1]);
    expect(payload).toEqual({
      userId: 'user-1',
      occurredAt: payload.occurredAt,
    });
  });

  it('continues successfully when an event listener throws', async () => {
    const subject = createSubject();
    const unsubscribe = eventBus.subscribe('auth.all_sessions_logged_out', () => {
      throw new Error('listener failed');
    });

    try {
      await expect(subject.service.logoutAll('user-1')).resolves.toBeUndefined();
      expect(subject.sessions.map((session) => session.userId)).toEqual(['user-2']);
    } finally {
      unsubscribe();
    }
  });

  it('does not publish if repository revocation fails', async () => {
    const subject = createSubject();
    subject.revokeAllSessions.mockRejectedValueOnce(new Error('database failed'));
    const publish = vi.spyOn(eventBus, 'publish');

    await expect(subject.service.logoutAll('user-1')).rejects.toThrow('database failed');
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('logoutAll controller invariant', () => {
  it('returns the dedicated typed error when middleware auth context is absent', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.post('/auth/logout-all', logoutAllController);
    app.use(errorHandler);

    const response = await request(app).post('/auth/logout-all').expect(500);
    const body = z
      .object({
        error: z.object({
          code: z.string(),
          message: z.string(),
        }),
      })
      .parse(response.body);

    expect(body.error).toEqual({
      code: ErrorCodes.AuthContextMissing,
      message: 'Authenticated request is missing auth context',
    });
  });
});

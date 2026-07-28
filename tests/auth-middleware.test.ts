import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { errorHandler } from '../src/common/middleware/error-handler.js';
import { requestIdMiddleware } from '../src/common/middleware/request-id.js';
import {
  authRepository,
  type AccessAuthSessionRecord,
} from '../src/modules/auth/auth.repository.js';
import { authenticateAccessToken } from '../src/modules/auth/auth.middleware.js';
import { tokenService } from '../src/modules/auth/token.service.js';

function accessToken(userId = 'user-1', sessionId = 'session-1'): string {
  return tokenService.signAccessToken({
    sub: userId,
    email: `${userId}@example.com`,
    role: 'ADMIN',
    sessionId,
    type: 'access',
  });
}

function createMiddlewareApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.get('/protected', authenticateAccessToken, (req, res) => {
    res.json(req.auth);
  });
  app.use(errorHandler);
  return app;
}

function mockSession(session: AccessAuthSessionRecord | null) {
  return vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue(session);
}

describe('authenticateAccessToken', () => {
  const app = createMiddlewareApp();

  it('populates the restricted auth context for a valid token and matching session', async () => {
    const findSession = mockSession({ id: 'session-1', userId: 'user-1' });

    const response = await request(app)
      .get('/protected')
      .set('authorization', `Bearer ${accessToken()}`)
      .expect(200);

    expect(findSession).toHaveBeenCalledWith('session-1', 'user-1');
    expect(response.body).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
      role: 'ADMIN',
    });
  });

  it.each([
    ['missing header', undefined],
    ['malformed scheme', `Basic ${accessToken()}`],
    ['malformed bearer', 'Bearer'],
    ['invalid token', 'Bearer invalid-token'],
  ])('returns 401 for %s', async (_name, authorization) => {
    const pending = request(app).get('/protected');
    if (authorization) {
      pending.set('authorization', authorization);
    }

    const response = await pending.expect(401);
    const body = z
      .object({ error: z.object({ code: z.literal('UNAUTHORIZED') }) })
      .parse(response.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for a valid JWT with a nonexistent or revoked session', async () => {
    mockSession(null);

    await request(app)
      .get('/protected')
      .set('authorization', `Bearer ${accessToken()}`)
      .expect(401);
  });

  it('requires session ownership by looking up both session and user IDs', async () => {
    const findSession = mockSession(null);

    await request(app)
      .get('/protected')
      .set('authorization', `Bearer ${accessToken('user-1', 'other-user-session')}`)
      .expect(401);

    expect(findSession).toHaveBeenCalledWith('other-user-session', 'user-1');
  });

  it('passes repository failures to the global 500 handler', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockRejectedValue(
      new Error('database failed'),
    );

    const response = await request(app)
      .get('/protected')
      .set('authorization', `Bearer ${accessToken()}`)
      .expect(500);
    const body = z
      .object({ error: z.object({ code: z.literal('INTERNAL_SERVER_ERROR') }) })
      .parse(response.body);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

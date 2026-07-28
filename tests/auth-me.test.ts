import { createHmac } from 'node:crypto';

import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { ErrorCodes } from '../src/common/errors/error-codes.js';
import { swaggerDocument } from '../src/config/swagger.js';
import { env } from '../src/config/env.js';
import { authRepository, AuthRepository } from '../src/modules/auth/auth.repository.js';
import { authService, AuthService } from '../src/modules/auth/auth.service.js';
import { tokenService } from '../src/modules/auth/token.service.js';

function accessToken(userId = 'user-1', sessionId = 'session-1'): string {
  return tokenService.signAccessToken({
    sub: userId,
    email: `${userId}@example.com`,
    role: 'USER',
    sessionId,
    type: 'access',
  });
}

function expiredAccessToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'user-1',
      email: 'user-1@example.com',
      role: 'USER',
      sessionId: 'session-1',
      type: 'access',
      iat: 1,
      exp: 2,
    }),
  ).toString('base64url');
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(unsignedToken)
    .digest('base64url');
  return `${unsignedToken}.${signature}`;
}

function expectErrorCode(body: unknown, code: string): void {
  const response = z
    .object({
      error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.unknown(),
        requestId: z.string().min(1),
      }),
    })
    .parse(body);
  expect(response.error.code).toBe(code);
}

describe('GET /api/v1/auth/me', () => {
  const app = createApp();

  it('returns the current user for a valid access token and active session', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
    });
    const getCurrentUser = vi.spyOn(authService, 'getCurrentUser').mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user-1@example.com',
        displayName: 'User One',
        role: 'USER',
        createdAt: '2026-07-28T10:00:00.000Z',
      },
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken()}`)
      .expect(200);

    expect(getCurrentUser).toHaveBeenCalledWith('user-1');
    expect(response.body).toEqual({
      user: {
        id: 'user-1',
        email: 'user-1@example.com',
        displayName: 'User One',
        role: 'USER',
        createdAt: '2026-07-28T10:00:00.000Z',
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|refreshTokenHash|authSessions|sessionId/i,
    );
  });

  it('uses only the authenticated user ID and ignores alternate identity inputs', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
    });
    const getCurrentUser = vi.spyOn(authService, 'getCurrentUser').mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user-1@example.com',
        displayName: null,
        role: 'USER',
        createdAt: '2026-07-28T10:00:00.000Z',
      },
    });

    const response = await request(app)
      .get('/api/v1/auth/me?userId=user-2')
      .set('authorization', `Bearer ${accessToken('user-1')}`)
      .set('x-user-id', 'user-2')
      .send({ userId: 'user-2' })
      .expect(200);

    expect(getCurrentUser).toHaveBeenCalledWith('user-1');
    expect(z.object({ user: z.object({ id: z.string() }) }).parse(response.body).user.id).toBe(
      'user-1',
    );
  });

  it('returns 401 when Authorization is missing', async () => {
    const response = await request(app).get('/api/v1/auth/me').expect(401);
    expectErrorCode(response.body, ErrorCodes.Unauthorized);
  });

  it('returns 401 for a malformed access token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', 'Bearer malformed')
      .expect(401);
    expectErrorCode(response.body, ErrorCodes.Unauthorized);
  });

  it('returns 401 for an expired access token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${expiredAccessToken()}`)
      .expect(401);
    expectErrorCode(response.body, ErrorCodes.Unauthorized);
  });

  it('returns 401 when the referenced session is revoked or inactive', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue(null);
    const getCurrentUser = vi.spyOn(authService, 'getCurrentUser');

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken()}`)
      .expect(401);

    expectErrorCode(response.body, ErrorCodes.Unauthorized);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('returns the NOT_FOUND AppError contract when the authenticated user no longer exists', async () => {
    vi.spyOn(authRepository, 'findActiveSessionForAccessToken').mockResolvedValue({
      id: 'session-1',
      userId: 'deleted-user',
    });
    vi.spyOn(authRepository, 'findCurrentUserById').mockResolvedValue(null);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken('deleted-user')}`)
      .expect(404);

    expectErrorCode(response.body, ErrorCodes.NotFound);
    expect(
      z.object({ error: z.object({ message: z.string() }) }).parse(response.body).error.message,
    ).toBe('User not found');
  });

  it('documents the response and Bearer authentication in OpenAPI', () => {
    const operation = swaggerDocument.paths['/auth/me']?.get;

    expect(operation?.security).toEqual([{ bearerAuth: [] }]);
    expect(operation?.responses['200']).toBeDefined();
    expect(operation?.responses['401']).toBeDefined();
    expect(operation?.responses['404']).toBeDefined();
    expect(swaggerDocument.components?.schemas?.CurrentUserResponse).toBeDefined();
  });
});

describe('AuthService.getCurrentUser', () => {
  it('maps only explicitly selected public user fields', async () => {
    const repository = new AuthRepository();
    const findCurrentUserById = vi.spyOn(repository, 'findCurrentUserById').mockResolvedValue({
      id: 'user-1',
      email: 'user-1@example.com',
      role: 'ADMIN',
      createdAt: new Date('2026-07-28T10:00:00.000Z'),
      profile: { displayName: 'User One' },
    });
    const service = new AuthService(repository);

    const result = await service.getCurrentUser('user-1');

    expect(findCurrentUserById).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      user: {
        id: 'user-1',
        email: 'user-1@example.com',
        displayName: 'User One',
        role: 'ADMIN',
        createdAt: '2026-07-28T10:00:00.000Z',
      },
    });
  });

  it('returns a null displayName when the user has no profile', async () => {
    const repository = new AuthRepository();
    vi.spyOn(repository, 'findCurrentUserById').mockResolvedValue({
      id: 'user-1',
      email: 'user-1@example.com',
      role: 'USER',
      createdAt: new Date('2026-07-28T10:00:00.000Z'),
      profile: null,
    });

    await expect(new AuthService(repository).getCurrentUser('user-1')).resolves.toMatchObject({
      user: { displayName: null },
    });
  });

  it('throws the expected AppError when the user does not exist', async () => {
    const repository = new AuthRepository();
    vi.spyOn(repository, 'findCurrentUserById').mockResolvedValue(null);

    await expect(new AuthService(repository).getCurrentUser('missing-user')).rejects.toMatchObject({
      code: ErrorCodes.NotFound,
      message: 'User not found',
      statusCode: 404,
    });
  });
});

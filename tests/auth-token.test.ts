import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { tokenService } from '../src/modules/auth/token.service.js';

const now = Math.floor(Date.now() / 1000);
const validHeader = { alg: 'HS256', typ: 'JWT' };
const validPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  sessionId: 'session-1',
  type: 'access',
  iat: now,
  exp: now + 900,
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signedToken(header: unknown, payload: unknown): string {
  const encodedHeader = encode(header);
  const encodedPayload = encode(payload);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(unsignedToken)
    .digest('base64url');
  return `${unsignedToken}.${signature}`;
}

describe('TokenService.verifyAccessToken', () => {
  it('accepts a valid access token', () => {
    const token = tokenService.signAccessToken({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      sessionId: 'session-1',
      type: 'access',
    });

    expect(tokenService.verifyAccessToken(token)).toEqual({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      sessionId: 'session-1',
      type: 'access',
    });
  });

  it.each(['', 'one', 'one.two', 'one.two.three.four', '..'])(
    'rejects malformed token structure: %s',
    (token) => {
      expect(tokenService.verifyAccessToken(token)).toBeNull();
    },
  );

  it('rejects an invalid signature', () => {
    const token = signedToken(validHeader, validPayload);
    expect(tokenService.verifyAccessToken(`${token.slice(0, -1)}x`)).toBeNull();
    expect(tokenService.verifyAccessToken(`${token}!`)).toBeNull();
  });

  it.each([
    ['expired token', { ...validPayload, iat: now - 100, exp: now - 1 }],
    ['exp equal to iat', { ...validPayload, iat: now + 10, exp: now + 10 }],
    ['exp before iat', { ...validPayload, iat: now + 10, exp: now + 9 }],
    ['non-access type', { ...validPayload, type: 'refresh' }],
    ['missing sub', { ...validPayload, sub: undefined }],
    ['empty sub', { ...validPayload, sub: '' }],
    ['missing email', { ...validPayload, email: undefined }],
    ['empty sessionId', { ...validPayload, sessionId: '' }],
    ['unsupported role', { ...validPayload, role: 'SUPER_ADMIN' }],
    ['fractional iat', { ...validPayload, iat: now + 0.5 }],
    ['infinite exp', { ...validPayload, exp: Number.POSITIVE_INFINITY }],
  ])('rejects payload with %s', (_name, payload) => {
    expect(tokenService.verifyAccessToken(signedToken(validHeader, payload))).toBeNull();
  });

  it.each([
    ['missing alg', { typ: 'JWT' }],
    ['missing typ', { alg: 'HS256' }],
    ['alg none', { alg: 'none', typ: 'JWT' }],
    ['unsupported algorithm', { alg: 'RS256', typ: 'JWT' }],
    ['invalid typ', { alg: 'HS256', typ: 'jwt' }],
    ['incorrectly typed alg', { alg: 123, typ: 'JWT' }],
    ['extra metadata', { alg: 'HS256', typ: 'JWT', kid: 'key-1' }],
  ])('rejects header with %s', (_name, header) => {
    expect(tokenService.verifyAccessToken(signedToken(header, validPayload))).toBeNull();
  });

  it.each([
    'not-base64url.payload.signature',
    `${Buffer.from('{').toString('base64url')}.${encode(validPayload)}.signature`,
    `${encode(validHeader)}.${Buffer.from('{').toString('base64url')}.signature`,
  ])('returns null without throwing for malformed encoding or JSON', (token) => {
    expect(() => tokenService.verifyAccessToken(token)).not.toThrow();
    expect(tokenService.verifyAccessToken(token)).toBeNull();
  });
});

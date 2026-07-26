import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '../../config/env.js';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
  type: 'access';
}

interface JwtPayload extends AccessTokenClaims {
  iat: number;
  exp: number;
}

function isJwtPayload(value: unknown): value is JwtPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.role === 'string' &&
    typeof payload.sessionId === 'string' &&
    payload.type === 'access' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number'
  );
}

function encodeJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export class TokenService {
  public generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  public hash(rawToken: string): string {
    return hashToken(rawToken);
  }

  public signAccessToken(claims: AccessTokenClaims): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      ...claims,
      iat: issuedAt,
      exp: issuedAt + env.JWT_ACCESS_TTL_SECONDS,
    };
    const encodedHeader = encodeJson({ alg: 'HS256', typ: 'JWT' });
    const encodedPayload = encodeJson(payload);
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(unsignedToken)
      .digest('base64url');

    return `${unsignedToken}.${signature}`;
  }

  public verifyAccessToken(token: string): AccessTokenClaims | null {
    const parts = token.split('.');
    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const encodedSignature = parts[2];

    if (!encodedHeader || !encodedPayload || !encodedSignature || parts.length !== 3) {
      return null;
    }

    const expectedSignature = createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();

    let actualSignature: Buffer;
    let payload: unknown;
    try {
      actualSignature = Buffer.from(encodedSignature, 'base64url');
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown;
    } catch {
      return null;
    }

    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature) ||
      !isJwtPayload(payload) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
      type: payload.type,
    };
  }

  public get accessTokenTtlSeconds(): number {
    return env.JWT_ACCESS_TTL_SECONDS;
  }

  public get refreshTokenTtlDays(): number {
    return env.JWT_REFRESH_TTL_DAYS;
  }
}

export const tokenService = new TokenService();

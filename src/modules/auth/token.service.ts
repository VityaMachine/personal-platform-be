import { createHash, createHmac, randomBytes } from 'node:crypto';

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

  public get accessTokenTtlSeconds(): number {
    return env.JWT_ACCESS_TTL_SECONDS;
  }

  public get refreshTokenTtlDays(): number {
    return env.JWT_REFRESH_TTL_DAYS;
  }
}

export const tokenService = new TokenService();

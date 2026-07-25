import { env } from '../../config/env.js';
import { hashToken, tokenService } from './token.service.js';

interface VerificationTokenData {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export class EmailVerificationService {
  public generateToken(): VerificationTokenData {
    const rawToken = tokenService.generateOpaqueToken();

    return {
      rawToken,
      tokenHash: this.hashToken(rawToken),
      expiresAt: this.calculateExpiry(),
    };
  }

  public hashToken(rawToken: string): string {
    return hashToken(rawToken);
  }

  public calculateExpiry(): Date {
    return new Date(Date.now() + env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);
  }

  public buildVerificationUrl(rawToken: string): string {
    const url = new URL('/verify-email', env.FRONTEND_URL);
    url.searchParams.set('token', rawToken);

    return url.toString();
  }
}

export const emailVerificationService = new EmailVerificationService();

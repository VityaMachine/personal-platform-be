import type { User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../src/common/errors/app-error.js';
import { ErrorCodes } from '../src/common/errors/error-codes.js';
import { eventBus } from '../src/infrastructure/events/event-bus.js';
import type {
  AuthRepository,
  VerificationTokenRecord,
} from '../src/modules/auth/auth.repository.js';
import { verifyEmailBodySchema } from '../src/modules/auth/auth.schemas.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import type { EmailProvider } from '../src/modules/auth/email-provider.js';
import { EmailVerificationService } from '../src/modules/auth/email-verification.service.js';
import type { PasswordService } from '../src/modules/auth/password.service.js';

const now = new Date();
const user: User = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'secret-hash',
  role: 'USER',
  isEmailVerified: false,
  createdAt: now,
  updatedAt: now,
};

function tokenRecord(overrides: Partial<VerificationTokenRecord> = {}): VerificationTokenRecord {
  return {
    id: 'token-1',
    userId: user.id,
    tokenHash: 'stored-hash',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdAt: now,
    user,
    ...overrides,
  };
}

function createSubject(record: VerificationTokenRecord | null) {
  const findEmailVerificationTokenByHash =
    vi.fn<AuthRepository['findEmailVerificationTokenByHash']>();
  findEmailVerificationTokenByHash.mockResolvedValue(record);
  const consumeEmailVerificationToken =
    vi.fn<AuthRepository['consumeEmailVerificationToken']>();
  consumeEmailVerificationToken.mockResolvedValue({
    ...user,
    isEmailVerified: true,
  });
  const repository = {
    findEmailVerificationTokenByHash,
    consumeEmailVerificationToken,
  } as unknown as AuthRepository;
  const hashing = new EmailVerificationService();
  const service = new AuthService(repository, {} as PasswordService, hashing, {} as EmailProvider);

  return { service, findEmailVerificationTokenByHash, consumeEmailVerificationToken, hashing };
}

describe('verify email validation', () => {
  it.each([{}, { token: '' }, { token: '   ' }])('rejects a missing or blank token: %j', (body) => {
    expect(verifyEmailBodySchema.safeParse(body).success).toBe(false);
  });

  it('trims a valid token', () => {
    expect(verifyEmailBodySchema.parse({ token: ' raw-token ' })).toEqual({ token: 'raw-token' });
  });
});

describe('AuthService.verifyEmail', () => {
  it('hashes the raw token, consumes it, publishes the event, and returns a safe response', async () => {
    const subject = createSubject(tokenRecord());
    const publish = vi.spyOn(eventBus, 'publish');

    const result = await subject.service.verifyEmail('raw-token');

    expect(subject.findEmailVerificationTokenByHash).toHaveBeenCalledWith(
      subject.hashing.hashToken('raw-token'),
    );
    expect(subject.consumeEmailVerificationToken).toHaveBeenCalledWith(
      'token-1',
      'user-1',
      expect.any(Date),
    );
    const verifiedAt = subject.consumeEmailVerificationToken.mock.calls[0]?.[2];
    expect(verifiedAt).toBeInstanceOf(Date);
    expect(publish).toHaveBeenCalledWith('auth.email_verified', {
      userId: 'user-1',
      email: 'user@example.com',
      verifiedAt: verifiedAt?.toISOString(),
    });
    expect(result).toEqual({
      message: 'Email verified successfully',
      user: { id: 'user-1', email: 'user@example.com', isEmailVerified: true },
    });
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|tokenHash|accessToken|refreshToken/);
  });

  it.each([
    ['unknown', null],
    ['used', tokenRecord({ usedAt: new Date() })],
  ])('returns the same invalid-token error for an %s token', async (_name, record) => {
    const { service, consumeEmailVerificationToken } = createSubject(record);

    await expect(service.verifyEmail('raw-token')).rejects.toMatchObject({
      code: ErrorCodes.InvalidVerificationToken,
      message: 'Invalid verification token',
      statusCode: 400,
    } satisfies Partial<AppError>);
    expect(consumeEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service, consumeEmailVerificationToken } = createSubject(
      tokenRecord({ expiresAt: new Date(Date.now() - 1_000) }),
    );

    await expect(service.verifyEmail('raw-token')).rejects.toMatchObject({
      code: ErrorCodes.VerificationTokenExpired,
      message: 'Verification token has expired',
      statusCode: 400,
    } satisfies Partial<AppError>);
    expect(consumeEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('consumes a valid token for an already verified user', async () => {
    const record = tokenRecord({ user: { ...user, isEmailVerified: true } });
    const subject = createSubject(record);

    await expect(subject.service.verifyEmail('raw-token')).resolves.toMatchObject({
      user: { isEmailVerified: true },
    });
    expect(subject.consumeEmailVerificationToken).toHaveBeenCalledOnce();
  });

  it('does not publish when the transaction fails', async () => {
    const subject = createSubject(tokenRecord());
    vi.mocked(subject.consumeEmailVerificationToken).mockRejectedValueOnce(
      new Error('transaction rolled back'),
    );
    const publish = vi.spyOn(eventBus, 'publish');

    await expect(subject.service.verifyEmail('raw-token')).rejects.toThrow(
      'transaction rolled back',
    );
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not fail verification when an EventBus listener throws', async () => {
    const unsubscribe = eventBus.subscribe('auth.email_verified', () => {
      throw new Error('listener failed');
    });
    const { service } = createSubject(tokenRecord());

    try {
      await expect(service.verifyEmail('raw-token')).resolves.toMatchObject({
        message: 'Email verified successfully',
      });
    } finally {
      unsubscribe();
    }
  });
});

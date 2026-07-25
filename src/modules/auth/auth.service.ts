import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCodes } from '../../common/errors/error-codes.js';
import { eventBus } from '../../infrastructure/events/event-bus.js';
import { logger } from '../../infrastructure/logger/logger.js';
import {
  authRepository,
  type AuthRepository,
  type RegisteredUserRecord,
} from './auth.repository.js';
import { emailProvider, type EmailProvider } from './email-provider.js';
import {
  emailVerificationService,
  type EmailVerificationService,
} from './email-verification.service.js';
import { passwordService, type PasswordService } from './password.service.js';
import type {
  EmailVerifiedEvent,
  RegisterInput,
  RegisterResult,
  UserRegisteredEvent,
  VerifyEmailResult,
} from './auth.types.js';

export class AuthService {
  public constructor(
    private readonly repository: AuthRepository = authRepository,
    private readonly passwords: PasswordService = passwordService,
    private readonly emailVerification: EmailVerificationService = emailVerificationService,
    private readonly emails: EmailProvider = emailProvider,
  ) {}

  public async register(input: RegisterInput): Promise<RegisterResult> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();

    const existingUser = await this.repository.findUserByEmail(email);

    if (existingUser) {
      throw this.createDuplicateEmailError();
    }

    const passwordHash = await this.passwords.hash(input.password);
    const verificationToken = this.emailVerification.generateToken();

    let user: RegisteredUserRecord;

    try {
      user = await this.repository.createUserWithProfileSettingsAndVerificationToken({
        email,
        passwordHash,
        displayName,
        verificationTokenHash: verificationToken.tokenHash,
        verificationTokenExpiresAt: verificationToken.expiresAt,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw this.createDuplicateEmailError();
      }

      throw error;
    }

    const verificationUrl = this.emailVerification.buildVerificationUrl(verificationToken.rawToken);

    try {
      await this.emails.sendEmailVerification({
        email,
        verificationUrl,
      });
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Email verification stub failed');
    }

    await eventBus.publish('auth.user_registered', {
      userId: user.id,
      email: user.email,
      occurredAt: new Date().toISOString(),
    } satisfies UserRegisteredEvent);

    return this.toRegisterResult(user);
  }

  public async verifyEmail(rawToken: string): Promise<VerifyEmailResult> {
    const tokenHash = this.emailVerification.hashToken(rawToken);
    const token = await this.repository.findEmailVerificationTokenByHash(tokenHash);

    if (!token || token.usedAt) {
      throw new AppError({
        code: ErrorCodes.InvalidVerificationToken,
        message: 'Invalid verification token',
        statusCode: 400,
      });
    }

    const verifiedAt = new Date();
    if (token.expiresAt < verifiedAt) {
      throw new AppError({
        code: ErrorCodes.VerificationTokenExpired,
        message: 'Verification token has expired',
        statusCode: 400,
      });
    }

    const user = await this.repository.consumeEmailVerificationToken(
      token.id,
      token.userId,
      verifiedAt,
    );

    await eventBus.publish('auth.email_verified', {
      userId: user.id,
      email: user.email,
      verifiedAt: verifiedAt.toISOString(),
    } satisfies EmailVerifiedEvent);

    return {
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        isEmailVerified: true,
      },
    };
  }

  private toRegisterResult(user: RegisteredUserRecord): RegisterResult {
    if (!user.profile || !user.settings) {
      throw new Error('Registered user is missing profile or settings');
    }

    return {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      profile: {
        displayName: user.profile.displayName,
        timeZone: user.profile.timeZone,
      },
      settings: {
        startOfWeek: user.settings.startOfWeek,
        startupPage: user.settings.startupPage,
        locale: user.settings.locale,
        theme: user.settings.theme,
      },
      createdAt: user.createdAt.toISOString(),
    };
  }

  private createDuplicateEmailError(): AppError {
    return new AppError({
      code: ErrorCodes.EmailAlreadyInUse,
      message: 'Email is already in use',
      statusCode: 409,
      details: [],
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}

export const authService = new AuthService();

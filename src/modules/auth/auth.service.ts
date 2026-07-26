import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCodes } from '../../common/errors/error-codes.js';
import { eventBus } from '../../infrastructure/events/event-bus.js';
import { logger } from '../../infrastructure/logger/logger.js';
import {
  authRepository,
  type AuthRepository,
  type LoginUserRecord,
  type RegisteredUserRecord,
} from './auth.repository.js';
import { emailProvider, type EmailProvider } from './email-provider.js';
import {
  emailVerificationService,
  type EmailVerificationService,
} from './email-verification.service.js';
import { passwordService, type PasswordService } from './password.service.js';
import { tokenService, type TokenService } from './token.service.js';
import type {
  EmailVerifiedEvent,
  LoginInput,
  LoginResult,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  RegisterResult,
  SessionRefreshedEvent,
  UserRegisteredEvent,
  UserLoggedInEvent,
  UserLoggedOutEvent,
  VerifyEmailResult,
} from './auth.types.js';

export class AuthService {
  public constructor(
    private readonly repository: AuthRepository = authRepository,
    private readonly passwords: PasswordService = passwordService,
    private readonly emailVerification: EmailVerificationService = emailVerificationService,
    private readonly emails: EmailProvider = emailProvider,
    private readonly tokens: TokenService = tokenService,
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

  public async login(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.repository.findLoginUserByEmail(email);

    if (!user?.passwordHash || !(await this.passwords.compare(input.password, user.passwordHash))) {
      throw this.createInvalidCredentialsError();
    }

    if (!user.isEmailVerified) {
      throw new AppError({
        code: ErrorCodes.EmailNotVerified,
        message: 'Email address is not verified',
        statusCode: 403,
      });
    }

    if (!user.profile || !user.settings) {
      throw new Error('Login user is missing profile or settings');
    }

    const refreshToken = this.tokens.generateOpaqueToken();
    const refreshTokenHash = this.tokens.hash(refreshToken);
    const expiresAt = new Date(Date.now() + this.tokens.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
    const session = await this.repository.createAuthSession({
      userId: user.id,
      refreshTokenHash,
      expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });

    let accessToken: string;
    try {
      accessToken = this.tokens.signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        sessionId: session.id,
        type: 'access',
      });
    } catch (error) {
      try {
        await this.repository.deleteAuthSession(session.id);
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError, sessionId: session.id },
          'Failed to clean up session after access-token signing failure',
        );
      }
      throw error;
    }

    const loggedInAt = new Date().toISOString();
    await eventBus.publish('auth.user_logged_in', {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
      loggedInAt,
    } satisfies UserLoggedInEvent);

    return this.toTokenResult(user, accessToken, refreshToken);
  }

  public async refresh(input: RefreshInput): Promise<LoginResult> {
    const currentRefreshTokenHash = this.tokens.hash(input.refreshToken);
    const session = await this.repository.findRefreshSessionByHash(currentRefreshTokenHash);
    const refreshedAt = new Date();

    if (!session || session.revokedAt || session.expiresAt.getTime() <= refreshedAt.getTime()) {
      throw this.createInvalidRefreshTokenError();
    }

    const { user } = session;
    if (!user.isEmailVerified) {
      throw new AppError({
        code: ErrorCodes.EmailNotVerified,
        message: 'Email address is not verified',
        statusCode: 403,
      });
    }

    if (!user.profile || !user.settings) {
      throw new Error('Refresh user is missing profile or settings');
    }

    const nextRefreshToken = this.tokens.generateOpaqueToken();
    const nextRefreshTokenHash = this.tokens.hash(nextRefreshToken);
    const expiresAt = new Date(
      refreshedAt.getTime() + this.tokens.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );

    const accessToken = await this.repository.rotateAuthSessionAtomically(
      {
        sessionId: session.id,
        currentRefreshTokenHash,
        nextRefreshTokenHash,
        expiresAt,
        rotatedAt: refreshedAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      },
      () =>
        this.tokens.signAccessToken({
          sub: user.id,
          email: user.email,
          role: user.role,
          sessionId: session.id,
          type: 'access',
        }),
    );

    if (!accessToken) {
      throw this.createInvalidRefreshTokenError();
    }

    await eventBus.publish('auth.session_refreshed', {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
      refreshedAt: refreshedAt.toISOString(),
    } satisfies SessionRefreshedEvent);

    return this.toTokenResult(user, accessToken, nextRefreshToken);
  }

  public async logout(input: LogoutInput): Promise<void> {
    const refreshTokenHash = this.tokens.hash(input.refreshToken);
    const loggedOutAt = new Date();
    const session = await this.repository.revokeActiveAuthSession({
      refreshTokenHash,
      revokedAt: loggedOutAt,
    });

    if (!session) {
      return;
    }

    await eventBus.publish('auth.user_logged_out', {
      userId: session.userId,
      sessionId: session.id,
      loggedOutAt: session.revokedAt.toISOString(),
    } satisfies UserLoggedOutEvent);
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

  private createInvalidCredentialsError(): AppError {
    return new AppError({
      code: ErrorCodes.InvalidCredentials,
      message: 'Invalid email or password',
      statusCode: 401,
    });
  }

  private createInvalidRefreshTokenError(): AppError {
    return new AppError({
      code: ErrorCodes.InvalidRefreshToken,
      message: 'Invalid refresh token',
      statusCode: 401,
    });
  }

  private toTokenResult(
    user: LoginUserRecord,
    accessToken: string,
    refreshToken: string,
  ): LoginResult {
    if (!user.profile || !user.settings) {
      throw new Error('Login user is missing profile or settings');
    }

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: true,
        profile: {
          displayName: user.profile.displayName,
          avatarUrl: user.profile.avatarUrl,
          timeZone: user.profile.timeZone,
        },
        settings: {
          startOfWeek: user.settings.startOfWeek,
          startupPage: user.settings.startupPage,
          locale: user.settings.locale,
          theme: user.settings.theme,
        },
      },
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}

export const authService = new AuthService();

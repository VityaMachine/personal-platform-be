import type { Prisma, PrismaClient, User } from '@prisma/client';

import { prisma } from '../../infrastructure/database/prisma.js';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  verificationTokenHash: string;
  verificationTokenExpiresAt: Date;
}

interface CreateAuthSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

interface RotateAuthSessionInput {
  sessionId: string;
  currentRefreshTokenHash: string;
  nextRefreshTokenHash: string;
  expiresAt: Date;
  rotatedAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

interface RevokeAuthSessionInput {
  refreshTokenHash: string;
  revokedAt: Date;
}

export interface RevokedAuthSessionRecord {
  id: string;
  userId: string;
  revokedAt: Date;
}

export type RegisteredUserRecord = Prisma.UserGetPayload<{
  include: {
    profile: true;
    settings: true;
  };
}>;

export type VerificationTokenRecord = Prisma.EmailVerificationTokenGetPayload<{
  include: { user: true };
}>;

export type LoginUserRecord = Prisma.UserGetPayload<{
  include: {
    profile: true;
    settings: true;
  };
}>;

export type RefreshSessionRecord = Prisma.AuthSessionGetPayload<{
  include: {
    user: {
      include: {
        profile: true;
        settings: true;
      };
    };
  };
}>;

export class AuthRepository {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findUserByEmail(
    email: string,
    tx: Prisma.TransactionClient = this.client,
  ): Promise<User | null> {
    return tx.user.findUnique({
      where: { email },
    });
  }

  public async findLoginUserByEmail(email: string): Promise<LoginUserRecord | null> {
    return this.client.user.findUnique({
      where: { email },
      include: {
        profile: true,
        settings: true,
      },
    });
  }

  public async createAuthSession(input: CreateAuthSessionInput) {
    return this.client.authSession.create({
      data: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  public async deleteAuthSession(sessionId: string): Promise<void> {
    await this.client.authSession.delete({
      where: { id: sessionId },
    });
  }

  public async findRefreshSessionByHash(
    refreshTokenHash: string,
  ): Promise<RefreshSessionRecord | null> {
    return this.client.authSession.findFirst({
      where: { refreshTokenHash },
      include: {
        user: {
          include: {
            profile: true,
            settings: true,
          },
        },
      },
    });
  }

  public async rotateAuthSessionAtomically<TResult>(
    input: RotateAuthSessionInput,
    beforeCommit: () => TResult | Promise<TResult>,
  ): Promise<TResult | null> {
    return this.client.$transaction(async (tx) => {
      const result = await tx.authSession.updateMany({
        where: {
          id: input.sessionId,
          refreshTokenHash: input.currentRefreshTokenHash,
          revokedAt: null,
          expiresAt: { gt: input.rotatedAt },
        },
        data: {
          refreshTokenHash: input.nextRefreshTokenHash,
          expiresAt: input.expiresAt,
          revokedAt: null,
          userAgent: input.userAgent ?? null,
          ipAddress: input.ipAddress ?? null,
        },
      });

      if (result.count !== 1) {
        return null;
      }

      return beforeCommit();
    });
  }

  public async revokeActiveAuthSession(
    input: RevokeAuthSessionInput,
  ): Promise<RevokedAuthSessionRecord | null> {
    const sessions = await this.client.authSession.updateManyAndReturn({
      where: {
        refreshTokenHash: input.refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: input.revokedAt },
      },
      data: {
        revokedAt: input.revokedAt,
        updatedAt: input.revokedAt,
      },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
      },
    });

    const session = sessions[0];
    if (!session?.revokedAt) {
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      revokedAt: session.revokedAt,
    };
  }

  public async createUserWithProfileSettingsAndVerificationToken(
    input: CreateUserInput,
  ): Promise<RegisteredUserRecord> {
    return this.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          role: 'USER',
          isEmailVerified: false,
          profile: {
            create: {
              displayName: input.displayName,
              timeZone: 'Europe/Kyiv',
            },
          },
          settings: {
            create: {},
          },
          emailVerificationTokens: {
            create: {
              tokenHash: input.verificationTokenHash,
              expiresAt: input.verificationTokenExpiresAt,
            },
          },
        },
        include: {
          profile: true,
          settings: true,
        },
      });

      return user;
    });
  }

  public async findEmailVerificationTokenByHash(
    tokenHash: string,
  ): Promise<VerificationTokenRecord | null> {
    return this.client.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  public async consumeEmailVerificationToken(
    tokenId: string,
    userId: string,
    verifiedAt: Date,
  ): Promise<User> {
    return this.client.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { isEmailVerified: true },
      });

      await tx.emailVerificationToken.update({
        where: { id: tokenId },
        data: { usedAt: verifiedAt },
      });

      return user;
    });
  }
}

export const authRepository = new AuthRepository();

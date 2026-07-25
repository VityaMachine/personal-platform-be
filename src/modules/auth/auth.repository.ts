import type { Prisma, PrismaClient, User } from '@prisma/client';

import { prisma } from '../../infrastructure/database/prisma.js';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  verificationTokenHash: string;
  verificationTokenExpiresAt: Date;
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

import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BackfillStats {
  processed: number;
  created: number;
  alreadyExisted: number;
  repairedMemberships: number;
  failed: number;
}

type BackfillOutcome = 'created' | 'already-existed' | 'repaired-membership';

class OwnerMembershipConflictError extends Error {
  public constructor(spaceId: string, ownerUserId: string, conflictingUserId: string) {
    super(
      `Personal Space ${spaceId} for owner ${ownerUserId} already has an OWNER membership for User ${conflictingUserId}; manual resolution is required`,
    );
    this.name = 'OwnerMembershipConflictError';
  }
}

async function ensurePersonalSpace(
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<BackfillOutcome> {
  const personalSpace = await tx.space.findFirst({
    where: {
      ownerId: userId,
      type: 'PERSONAL',
    },
    include: {
      members: {
        where: {
          OR: [{ role: 'OWNER' }, { userId }],
        },
      },
    },
  });

  if (!personalSpace) {
    const createdSpace = await tx.space.create({
      data: {
        name: 'Personal',
        type: 'PERSONAL',
        ownerId: userId,
      },
    });

    await tx.spaceMember.create({
      data: {
        spaceId: createdSpace.id,
        userId,
        role: 'OWNER',
      },
    });

    return 'created';
  }

  const ownerMembership = personalSpace.members.find((member) => member.role === 'OWNER');
  if (ownerMembership && ownerMembership.userId !== userId) {
    throw new OwnerMembershipConflictError(personalSpace.id, userId, ownerMembership.userId);
  }

  const lifecycleOwnerMembership = personalSpace.members.find((member) => member.userId === userId);
  if (lifecycleOwnerMembership?.role === 'OWNER') {
    return 'already-existed';
  }

  if (lifecycleOwnerMembership) {
    await tx.spaceMember.update({
      where: { id: lifecycleOwnerMembership.id },
      data: { role: 'OWNER' },
    });
  } else {
    await tx.spaceMember.create({
      data: {
        spaceId: personalSpace.id,
        userId,
        role: 'OWNER',
      },
    });
  }

  return 'repaired-membership';
}

async function backfillUser(userId: string): Promise<BackfillOutcome> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => ensurePersonalSpace(userId, tx));
    } catch (error) {
      const isRetryableUniqueConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

      if (!isRetryableUniqueConflict || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error(`Backfill retry loop ended unexpectedly for User ${userId}`);
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const stats: BackfillStats = {
    processed: users.length,
    created: 0,
    alreadyExisted: 0,
    repairedMemberships: 0,
    failed: 0,
  };

  for (const user of users) {
    try {
      const outcome = await backfillUser(user.id);

      if (outcome === 'created') {
        stats.created += 1;
      } else if (outcome === 'repaired-membership') {
        stats.repairedMemberships += 1;
      } else {
        stats.alreadyExisted += 1;
      }
    } catch (error) {
      stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to backfill Personal Space for User ${user.id}: ${message}`);
    }
  }

  console.info('Personal Space backfill completed');
  console.info(`processed: ${stats.processed}`);
  console.info(`created: ${stats.created}`);
  console.info(`already existed: ${stats.alreadyExisted}`);
  console.info(`repaired memberships: ${stats.repairedMemberships}`);
  console.info(`failed: ${stats.failed}`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error('Personal Space backfill failed before processing completed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

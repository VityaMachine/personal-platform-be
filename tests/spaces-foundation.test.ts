import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthRepository } from '../src/modules/auth/auth.repository.js';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/personal_platform_test';

let prisma: PrismaClient;
const createdUserIds = new Set<string>();

function assertSafeTestDatabase(url: string): void {
  const databaseName = new URL(url).pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run Spaces integration tests against non-test database: ${databaseName}`);
  }
}

function runMigrations(): void {
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
    },
    shell: true,
    stdio: 'pipe',
  });
}

async function createUser(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `${label}.${Date.now()}.${crypto.randomUUID()}@example.com`,
    },
  });
  createdUserIds.add(user.id);
  return user;
}

async function cleanupCreatedUsers(): Promise<void> {
  if (!createdUserIds.size) {
    return;
  }

  const userIds = [...createdUserIds];
  await prisma.space.deleteMany({
    where: {
      OR: [
        { ownerId: { in: userIds } },
        {
          members: {
            some: {
              userId: { in: userIds },
            },
          },
        },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: { in: userIds },
    },
  });
  createdUserIds.clear();
}

async function expectDatabaseRejection(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toBeDefined();
}

describe('Spaces Foundation database constraints', () => {
  beforeAll(
    () => {
      assertSafeTestDatabase(testDatabaseUrl);
      process.env.DATABASE_URL = testDatabaseUrl;
      runMigrations();
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: testDatabaseUrl,
          },
        },
      });
    },
    30_000,
  );

  beforeEach(async () => {
    await cleanupCreatedUsers();
  });

  afterAll(async () => {
    await cleanupCreatedUsers();
    await prisma.$disconnect();
  });

  it('allows at most one PERSONAL Space per lifecycle owner', async () => {
    const user = await createUser('one-personal');
    await prisma.space.create({
      data: { name: 'Personal', type: 'PERSONAL', ownerId: user.id },
    });

    await expectDatabaseRejection(
      prisma.space.create({
        data: { name: 'Another Personal', type: 'PERSONAL', ownerId: user.id },
      }),
    );
  });

  it('allows a lifecycle owner to own multiple SHARED Spaces', async () => {
    const user = await createUser('many-shared');
    await prisma.space.createMany({
      data: [
        { name: 'Shared One', type: 'SHARED', ownerId: user.id },
        { name: 'Shared Two', type: 'SHARED', ownerId: user.id },
      ],
    });

    await expect(
      prisma.space.count({
        where: { ownerId: user.id, type: 'SHARED' },
      }),
    ).resolves.toBe(2);
  });

  it('rejects duplicate membership for the same Space and User', async () => {
    const user = await createUser('duplicate-member');
    const space = await prisma.space.create({
      data: { name: 'Shared', type: 'SHARED', ownerId: user.id },
    });
    await prisma.spaceMember.create({
      data: { spaceId: space.id, userId: user.id, role: 'MEMBER' },
    });

    await expectDatabaseRejection(
      prisma.spaceMember.create({
        data: { spaceId: space.id, userId: user.id, role: 'ADMIN' },
      }),
    );
  });

  it('rejects two OWNER memberships for one Space', async () => {
    const owner = await createUser('primary-owner');
    const secondUser = await createUser('second-owner');
    const space = await prisma.space.create({
      data: { name: 'Shared', type: 'SHARED', ownerId: owner.id },
    });
    await prisma.spaceMember.create({
      data: { spaceId: space.id, userId: owner.id, role: 'OWNER' },
    });

    await expectDatabaseRejection(
      prisma.spaceMember.create({
        data: { spaceId: space.id, userId: secondUser.id, role: 'OWNER' },
      }),
    );
  });

  it.each(['', '   '])('rejects an empty Space name %j', async (name) => {
    const user = await createUser('empty-name');

    await expectDatabaseRejection(
      prisma.space.create({
        data: { name, type: 'SHARED', ownerId: user.id },
      }),
    );
  });

  it('deleting a Space cascades to its memberships', async () => {
    const user = await createUser('cascade-member');
    const space = await prisma.space.create({
      data: { name: 'Shared', type: 'SHARED', ownerId: user.id },
    });
    await prisma.spaceMember.create({
      data: { spaceId: space.id, userId: user.id, role: 'OWNER' },
    });

    await prisma.space.delete({ where: { id: space.id } });

    await expect(
      prisma.spaceMember.count({
        where: { spaceId: space.id },
      }),
    ).resolves.toBe(0);
  });

  it('restricts deletion of a User who owns a Space', async () => {
    const user = await createUser('owned-space');
    await prisma.space.create({
      data: { name: 'Shared', type: 'SHARED', ownerId: user.id },
    });

    await expectDatabaseRejection(prisma.user.delete({ where: { id: user.id } }));
  });

  it('restricts deletion of a User who is a Space member', async () => {
    const owner = await createUser('membership-owner');
    const member = await createUser('restricted-member');
    const space = await prisma.space.create({
      data: { name: 'Shared', type: 'SHARED', ownerId: owner.id },
    });
    await prisma.spaceMember.create({
      data: { spaceId: space.id, userId: member.id, role: 'MEMBER' },
    });

    await expectDatabaseRejection(prisma.user.delete({ where: { id: member.id } }));
  });
});

describe('registration aggregate rollback', () => {
  it.each(['space', 'spaceMember'] as const)(
    'rolls back every registration record when %s creation fails',
    async (failingModel) => {
      const email = `rollback-${failingModel}.${Date.now()}@example.com`;
      const extendedClient = prisma.$extends({
        query: {
          [failingModel]: {
            create() {
              throw new Error(`Forced ${failingModel} creation failure`);
            },
          },
        },
      });
      const repository = new AuthRepository(extendedClient as unknown as PrismaClient);

      await expect(
        repository.createRegisteredUserAggregate({
          email,
          passwordHash: 'password-hash',
          displayName: 'Rollback User',
          verificationTokenHash: crypto.randomUUID(),
          verificationTokenExpiresAt: new Date(Date.now() + 60_000),
        }),
      ).rejects.toThrow(`Forced ${failingModel} creation failure`);

      await expect(
        prisma.user.findUnique({
          where: { email },
          include: {
            profile: true,
            settings: true,
            emailVerificationTokens: true,
            ownedSpaces: true,
            spaceMemberships: true,
          },
        }),
      ).resolves.toBeNull();
    },
  );
});

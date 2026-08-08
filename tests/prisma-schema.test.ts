import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const schemaPath = new URL('../prisma/schema.prisma', import.meta.url);

describe('Prisma auth schema', () => {
  it('declares the initial auth data models and enums', async () => {
    const schema = await readFile(schemaPath, 'utf8');

    for (const modelName of [
      'User',
      'Profile',
      'UserSettings',
      'AuthSession',
      'ExternalAccount',
      'EmailVerificationToken',
      'Space',
      'SpaceMember',
      'Task',
      'TaskSpace',
      'Subtask',
    ]) {
      expect(schema).toContain(`model ${modelName} {`);
    }

    for (const enumName of [
      'UserRole',
      'StartOfWeek',
      'StartupPage',
      'Locale',
      'Theme',
      'AuthProvider',
      'SpaceType',
      'SpaceRole',
      'TaskStatus',
      'TaskPriority',
      'SubtaskStatus',
    ]) {
      expect(schema).toContain(`enum ${enumName} {`);
    }

    expect(schema).toContain('@@unique([provider, providerAccountId])');
    expect(schema).toContain('onDelete: Cascade');
    expect(schema).toMatch(/displayName\s+String\s*\n/);
    expect(schema).not.toMatch(/displayName\s+String\?/);
    expect(schema).toContain('@@unique([spaceId, userId])');
    expect(schema).toContain('@@unique([taskId, spaceId])');
    expect(schema).toContain('@@index([spaceId])');
    expect(schema).toContain('@@index([taskId])');
    expect(schema).toMatch(
      /owner\s+User\s+@relation\("SpaceOwner", fields: \[ownerId\], references: \[id\], onDelete: Restrict\)/,
    );
    expect(schema).toMatch(
      /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Restrict\)/,
    );
  });
});

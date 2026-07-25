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
    ]) {
      expect(schema).toContain(`enum ${enumName} {`);
    }

    expect(schema).toContain('@@unique([provider, providerAccountId])');
    expect(schema).toContain('onDelete: Cascade');
    expect(schema).toMatch(/displayName\s+String\s*\n/);
    expect(schema).not.toMatch(/displayName\s+String\?/);
  });
});

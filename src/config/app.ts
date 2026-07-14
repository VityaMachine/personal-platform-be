import { createRequire } from 'node:module';

import { z } from 'zod';

const require = createRequire(import.meta.url);

const packageJsonSchema = z.object({
  version: z.string().min(1),
});

const packageJson = packageJsonSchema.parse(require('../../package.json') as unknown);

export const appConfig = {
  version: packageJson.version,
} as const;

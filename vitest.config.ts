import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    restoreMocks: true,
    env: {
      JWT_ACCESS_SECRET: 'test-only-access-secret',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL_DAYS: '30',
    },
  },
});

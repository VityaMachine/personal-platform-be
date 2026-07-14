import { createServer } from 'node:http';

import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './infrastructure/database/prisma.js';
import { logger } from './infrastructure/logger/logger.js';

const server = createServer(app);

async function startServer(): Promise<void> {
  await prisma.$connect();

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'HTTP server started');
  });
}

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');

  server.close((error) => {
    void closeResources(error);
  });
}

async function closeResources(error?: Error): Promise<void> {
  if (error) {
    logger.error({ err: error }, 'HTTP server shutdown failed');
    process.exitCode = 1;
  }

  await prisma.$disconnect();
  process.exit();
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

startServer().catch(async (error: unknown) => {
  logger.error({ err: error }, 'Failed to start server');
  await prisma.$disconnect();
  process.exit(1);
});

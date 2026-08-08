import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { swaggerDocument } from './config/swagger.js';
import { errorHandler } from './common/middleware/error-handler.js';
import { notFoundMiddleware } from './common/middleware/not-found.js';
import { requestIdMiddleware } from './common/middleware/request-id.js';
import { httpLogger } from './infrastructure/logger/logger.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(requestIdMiddleware);
  app.use(httpLogger);

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.use('/api/v1', healthRouter);
  app.use('/api/v1', authRouter);
  app.use('/api/v1', tasksRouter);

  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

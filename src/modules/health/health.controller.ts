import type { Request, Response } from 'express';

import { appConfig } from '../../config/app.js';
import { env } from '../../config/env.js';

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    version: appConfig.version,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

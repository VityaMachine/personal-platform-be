import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/app-error.js';
import { ErrorCodes } from '../errors/error-codes.js';

export function notFoundMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next(
    new AppError({
      code: ErrorCodes.NotFound,
      message: 'Route not found',
      statusCode: 404,
      details: [],
    }),
  );
}

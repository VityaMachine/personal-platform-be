import type { ErrorRequestHandler } from 'express';

import { env } from '../../config/env.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCodes } from '../errors/error-codes.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError =
    error instanceof AppError
      ? error
      : new AppError({
          code: ErrorCodes.InternalServerError,
          message: 'Internal server error',
          statusCode: 500,
          details: [],
        });

  if (!(error instanceof AppError)) {
    logger.error(
      {
        err: env.NODE_ENV === 'development' ? error : undefined,
        requestId: req.requestId,
      },
      'Unhandled error',
    );
  }

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      requestId: req.requestId,
    },
  });
};

import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

import { AppError } from '../errors/app-error.js';
import { ErrorCodes } from '../errors/error-codes.js';

interface ValidationSchemas {
  body?: z.ZodTypeAny;
}

export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const bodyResult = schemas.body?.safeParse(req.body);

    if (bodyResult && !bodyResult.success) {
      next(
        new AppError({
          code: ErrorCodes.ValidationError,
          message: 'Request validation failed',
          statusCode: 400,
          details: bodyResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        }),
      );
      return;
    }

    if (bodyResult) {
      Object.defineProperty(req, 'body', {
        value: bodyResult.data as unknown,
        writable: true,
      });
    }

    next();
  };
}

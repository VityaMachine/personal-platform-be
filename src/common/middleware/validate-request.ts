import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

import { AppError } from '../errors/app-error.js';
import { ErrorCodes } from '../errors/error-codes.js';

interface ValidationSchemas {
  body?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

function toValidationDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const paramsResult = schemas.params?.safeParse(req.params);

    if (paramsResult && !paramsResult.success) {
      next(
        new AppError({
          code: ErrorCodes.ValidationError,
          message: 'Request validation failed',
          statusCode: 400,
          details: toValidationDetails(paramsResult.error),
        }),
      );
      return;
    }

    const bodyResult = schemas.body?.safeParse(req.body);

    if (bodyResult && !bodyResult.success) {
      next(
        new AppError({
          code: ErrorCodes.ValidationError,
          message: 'Request validation failed',
          statusCode: 400,
          details: toValidationDetails(bodyResult.error),
        }),
      );
      return;
    }

    if (paramsResult) {
      Object.defineProperty(req, 'params', {
        value: paramsResult.data as unknown,
        writable: true,
      });
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
import type { RequestHandler } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCodes } from '../../common/errors/error-codes.js';
import { tokenService } from './token.service.js';

function unauthorized(): AppError {
  return new AppError({
    code: ErrorCodes.Unauthorized,
    message: 'Authentication required',
    statusCode: 401,
  });
}

export const authenticateAccessToken: RequestHandler = (req, _res, next) => {
  const authorization = req.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/);

  if (!match?.[1]) {
    next(unauthorized());
    return;
  }

  const claims = tokenService.verifyAccessToken(match[1]);
  if (!claims) {
    next(unauthorized());
    return;
  }

  req.auth = {
    userId: claims.sub,
    sessionId: claims.sessionId,
  };
  next();
};

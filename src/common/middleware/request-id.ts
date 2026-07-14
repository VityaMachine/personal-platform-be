import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const requestIdHeader = 'X-Request-Id';
const maxRequestIdLength = 128;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header(requestIdHeader);
  const trimmedRequestId = incomingRequestId?.trim();
  const requestId =
    trimmedRequestId && trimmedRequestId.length <= maxRequestIdLength
      ? trimmedRequestId
      : randomUUID();

  req.requestId = requestId;
  res.setHeader(requestIdHeader, requestId);

  next();
}

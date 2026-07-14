import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const requestIdHeader = 'X-Request-Id';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header(requestIdHeader);
  const requestId = incomingRequestId?.trim() ? incomingRequestId : randomUUID();

  req.requestId = requestId;
  res.setHeader(requestIdHeader, requestId);

  next();
}

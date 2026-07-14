import type { Request, RequestHandler, Response } from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

import { env } from '../../config/env.js';

const loggerOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
};

if (env.NODE_ENV === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  };
}

export const logger = pino(loggerOptions);

function getRemoteAddress(req: Request): string | undefined {
  return req.ip ?? req.socket.remoteAddress;
}

function getResponseTime(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('responseTime' in value)) {
    return 0;
  }

  const responseTime = value.responseTime;

  return typeof responseTime === 'number' ? responseTime : 0;
}

function getCompactHttpLogObject(req: Request, res: Response, responseTime: number) {
  return {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime,
    remoteAddress: getRemoteAddress(req),
  };
}

function getHttpLogMessage(req: Request, res: Response, responseTime: number): string {
  return `${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime}ms requestId=${req.requestId}`;
}

function getHttpErrorLogMessage(req: Request, res: Response, error: Error): string {
  return `${req.method} ${req.originalUrl} ${res.statusCode} requestId=${req.requestId} error=${error.message}`;
}

export const httpLogger: RequestHandler = pinoHttp<Request, Response>({
  logger,
  quietReqLogger: true,
  quietResLogger: true,
  customAttributeKeys: {
    reqId: 'requestId',
  },
  genReqId: (req) => req.requestId ?? 'unknown',
  customSuccessObject: (req, res, value: unknown) =>
    getCompactHttpLogObject(req, res, getResponseTime(value)),
  customErrorObject: (req, res, error, value: unknown) => {
    const logObject = getCompactHttpLogObject(req, res, getResponseTime(value));

    return env.NODE_ENV === 'development' ? { ...logObject, err: error } : logObject;
  },
  customSuccessMessage: getHttpLogMessage,
  customErrorMessage: getHttpErrorLogMessage,
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) {
      return 'error';
    }

    if (res.statusCode >= 400) {
      return 'warn';
    }

    return 'info';
  },
});

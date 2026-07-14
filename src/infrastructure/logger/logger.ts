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

export const httpLogger = pinoHttp({
  logger,
  customProps: (req) => ({
    requestId: req.requestId,
  }),
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

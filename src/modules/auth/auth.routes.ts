import { Router } from 'express';

import { validateRequest } from '../../common/middleware/validate-request.js';
import { login, logout, logoutAll, refresh, register, verifyEmail } from './auth.controller.js';
import { authenticateAccessToken } from './auth.middleware.js';
import {
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  registerBodySchema,
  verifyEmailBodySchema,
} from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/auth/register', validateRequest({ body: registerBodySchema }), register);
authRouter.post(
  '/auth/verify-email',
  validateRequest({ body: verifyEmailBodySchema }),
  verifyEmail,
);
authRouter.post('/auth/login', validateRequest({ body: loginBodySchema }), login);
authRouter.post('/auth/refresh', validateRequest({ body: refreshBodySchema }), refresh);
authRouter.post('/auth/logout', validateRequest({ body: logoutBodySchema }), logout);
authRouter.post('/auth/logout-all', authenticateAccessToken, logoutAll);

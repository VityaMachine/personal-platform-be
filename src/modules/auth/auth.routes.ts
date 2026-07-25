import { Router } from 'express';

import { validateRequest } from '../../common/middleware/validate-request.js';
import { register, verifyEmail } from './auth.controller.js';
import { registerBodySchema, verifyEmailBodySchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/auth/register', validateRequest({ body: registerBodySchema }), register);
authRouter.post(
  '/auth/verify-email',
  validateRequest({ body: verifyEmailBodySchema }),
  verifyEmail,
);

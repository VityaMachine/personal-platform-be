import { Router } from 'express';

import { validateRequest } from '../../common/middleware/validate-request.js';
import { register } from './auth.controller.js';
import { registerBodySchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/auth/register', validateRequest({ body: registerBodySchema }), register);

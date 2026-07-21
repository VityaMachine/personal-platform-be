import type { RequestHandler } from 'express';

import { authService } from './auth.service.js';
import type { RegisterBody } from './auth.schemas.js';

export const register: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as RegisterBody;
    const result = await authService.register({
      email: body.email,
      password: body.password,
      displayName: body.displayName ?? null,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

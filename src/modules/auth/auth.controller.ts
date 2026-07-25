import type { RequestHandler } from 'express';

import { authService } from './auth.service.js';
import type { RegisterBody, VerifyEmailBody } from './auth.schemas.js';

export const register: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as RegisterBody;
    const result = await authService.register({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as VerifyEmailBody;
    const result = await authService.verifyEmail(body.token);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

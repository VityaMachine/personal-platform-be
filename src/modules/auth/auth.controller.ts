import type { RequestHandler } from 'express';

import { authService } from './auth.service.js';
import type {
  LoginBody,
  LogoutBody,
  RefreshBody,
  RegisterBody,
  VerifyEmailBody,
} from './auth.schemas.js';

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

export const login: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as LoginBody;
    const result = await authService.login({
      email: body.email,
      password: body.password,
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as RefreshBody;
    const result = await authService.refresh({
      refreshToken: body.refreshToken,
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as LogoutBody;
    await authService.logout({ refreshToken: body.refreshToken });
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
};

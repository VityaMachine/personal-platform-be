import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .refine((value) => !/\s/.test(value), 'Password must not contain spaces')
  .refine((value) => /[A-Za-z]/.test(value), 'Password must contain at least one letter')
  .refine((value) => /\d/.test(value), 'Password must contain at least one number')
  .refine(
    (value) => /[^A-Za-z0-9\s]/.test(value),
    'Password must contain at least one special character',
  );

const displayNameSchema = z
  .string({
    required_error: 'Display name is required',
    invalid_type_error: 'Display name must be a string',
  })
  .trim()
  .min(3, 'Display name must be at least 3 characters long')
  .max(50, 'Display name must be at most 50 characters long');

export const registerBodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: passwordSchema,
  displayName: displayNameSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const verifyEmailBodySchema = z.object({
  token: z
    .string({
      required_error: 'Token is required',
      invalid_type_error: 'Token must be a string',
    })
    .trim()
    .min(1, 'Token must not be empty'),
});

export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;

export const loginBodySchema = z.object({
  email: z
    .string({
      required_error: 'Email is required',
      invalid_type_error: 'Email must be a string',
    })
    .trim()
    .toLowerCase()
    .email()
    .max(254),
  password: z
    .string({
      required_error: 'Password is required',
      invalid_type_error: 'Password must be a string',
    })
    .min(1, 'Password must not be empty'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const refreshBodySchema = z.object({
  refreshToken: z
    .string({
      required_error: 'Refresh token is required',
      invalid_type_error: 'Refresh token must be a string',
    })
    .trim()
    .min(1, 'Refresh token must not be empty'),
});

export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const logoutBodySchema = z.object({
  refreshToken: z
    .string({
      required_error: 'Refresh token is required',
      invalid_type_error: 'Refresh token must be a string',
    })
    .trim()
    .min(1, 'Refresh token must not be empty'),
});

export type LogoutBody = z.infer<typeof logoutBodySchema>;

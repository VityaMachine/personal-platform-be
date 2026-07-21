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

const displayNameSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().min(1).max(100).nullable().optional(),
);

export const registerBodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: passwordSchema,
  displayName: displayNameSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

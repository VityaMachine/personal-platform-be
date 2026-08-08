import { z } from 'zod';

const idSchema = z
  .string({
    required_error: 'ID is required',
    invalid_type_error: 'ID must be a string',
  })
  .trim()
  .min(1, 'ID must not be empty')
  .max(64, 'ID must be at most 64 characters long')
  .regex(/^[A-Za-z0-9_-]+$/, 'ID contains unsupported characters');

const titleSchema = z
  .string({
    required_error: 'Title is required',
    invalid_type_error: 'Title must be a string',
  })
  .trim()
  .min(1, 'Title must not be empty')
  .max(200, 'Title must be at most 200 characters long');

const descriptionSchema = z
  .string({ invalid_type_error: 'Description must be a string' })
  .trim()
  .max(2_000, 'Description must be at most 2000 characters long')
  .optional();

export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);
export const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const subtaskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);

export const taskParamsSchema = z.object({
  taskId: idSchema,
});

export type TaskParams = z.infer<typeof taskParamsSchema>;

export const subtaskParamsSchema = z.object({
  taskId: idSchema,
  subtaskId: idSchema,
});

export type SubtaskParams = z.infer<typeof subtaskParamsSchema>;

export const createTaskBodySchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
});

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;

export const updateTaskBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema.optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;

export const createSubtaskBodySchema = z.object({
  title: titleSchema,
  position: z
    .number({ invalid_type_error: 'Position must be a number' })
    .int('Position must be an integer')
    .min(0, 'Position must be greater than or equal to 0')
    .optional(),
});

export type CreateSubtaskBody = z.infer<typeof createSubtaskBodySchema>;

export const updateSubtaskBodySchema = z
  .object({
    title: titleSchema.optional(),
    status: subtaskStatusSchema.optional(),
    position: z
      .number({ invalid_type_error: 'Position must be a number' })
      .int('Position must be an integer')
      .min(0, 'Position must be greater than or equal to 0')
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export type UpdateSubtaskBody = z.infer<typeof updateSubtaskBodySchema>;
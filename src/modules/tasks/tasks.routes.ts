import { Router } from 'express';

import { validateRequest } from '../../common/middleware/validate-request.js';
import { authenticateAccessToken } from '../auth/auth.middleware.js';
import {
  createSubtask,
  createTask,
  deleteSubtask,
  deleteTask,
  getTask,
  listTasks,
  updateSubtask,
  updateTask,
} from './tasks.controller.js';
import {
  createSubtaskBodySchema,
  createTaskBodySchema,
  subtaskParamsSchema,
  taskParamsSchema,
  updateSubtaskBodySchema,
  updateTaskBodySchema,
} from './tasks.schemas.js';

export const tasksRouter = Router();

tasksRouter.post('/tasks', authenticateAccessToken, validateRequest({ body: createTaskBodySchema }), createTask);
tasksRouter.get('/tasks', authenticateAccessToken, listTasks);
tasksRouter.get('/tasks/:taskId', authenticateAccessToken, validateRequest({ params: taskParamsSchema }), getTask);
tasksRouter.patch(
  '/tasks/:taskId',
  authenticateAccessToken,
  validateRequest({ params: taskParamsSchema, body: updateTaskBodySchema }),
  updateTask,
);
tasksRouter.delete(
  '/tasks/:taskId',
  authenticateAccessToken,
  validateRequest({ params: taskParamsSchema }),
  deleteTask,
);

tasksRouter.post(
  '/tasks/:taskId/subtasks',
  authenticateAccessToken,
  validateRequest({ params: taskParamsSchema, body: createSubtaskBodySchema }),
  createSubtask,
);
tasksRouter.patch(
  '/tasks/:taskId/subtasks/:subtaskId',
  authenticateAccessToken,
  validateRequest({ params: subtaskParamsSchema, body: updateSubtaskBodySchema }),
  updateSubtask,
);
tasksRouter.delete(
  '/tasks/:taskId/subtasks/:subtaskId',
  authenticateAccessToken,
  validateRequest({ params: subtaskParamsSchema }),
  deleteSubtask,
);
import type { RequestHandler } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCodes } from '../../common/errors/error-codes.js';
import type {
  CreateSubtaskBody,
  CreateTaskBody,
  SubtaskParams,
  TaskParams,
  UpdateSubtaskBody,
  UpdateTaskBody,
} from './tasks.schemas.js';
import { tasksService } from './tasks.service.js';

function getAuthenticatedUserId(req: Parameters<RequestHandler>[0]): string {
  if (!req.auth) {
    throw new AppError({
      code: ErrorCodes.AuthContextMissing,
      message: 'Authenticated request is missing auth context',
      statusCode: 500,
    });
  }

  return req.auth.userId;
}

export const createTask: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CreateTaskBody;
    const result = await tasksService.createTask({
      userId: getAuthenticatedUserId(req),
      title: body.title,
      description: body.description,
      priority: body.priority,
      status: body.status,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const listTasks: RequestHandler = async (req, res, next) => {
  try {
    const result = await tasksService.listTasks(getAuthenticatedUserId(req));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getTask: RequestHandler = async (req, res, next) => {
  try {
    const params = req.params as TaskParams;
    const result = await tasksService.getTask(getAuthenticatedUserId(req), params.taskId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateTask: RequestHandler = async (req, res, next) => {
  try {
    const params = req.params as TaskParams;
    const body = req.body as UpdateTaskBody;
    const result = await tasksService.updateTask({
      userId: getAuthenticatedUserId(req),
      taskId: params.taskId,
      title: body.title,
      description: body.description,
      priority: body.priority,
      status: body.status,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteTask: RequestHandler = async (req, res, next) => {
  try {
    const params = req.params as TaskParams;
    await tasksService.deleteTask({
      userId: getAuthenticatedUserId(req),
      taskId: params.taskId,
    });

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
};

export const createSubtask: RequestHandler = async (req, res, next) => {
  try {
    const params = req.params as TaskParams;
    const body = req.body as CreateSubtaskBody;
    const result = await tasksService.createSubtask({
      userId: getAuthenticatedUserId(req),
      taskId: params.taskId,
      title: body.title,
      position: body.position,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateSubtask: RequestHandler = async (req, res, next) => {
  try {
    const params = req.params as SubtaskParams;
    const body = req.body as UpdateSubtaskBody;
    const result = await tasksService.updateSubtask({
      userId: getAuthenticatedUserId(req),
      taskId: params.taskId,
      subtaskId: params.subtaskId,
      title: body.title,
      status: body.status,
      position: body.position,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteSubtask: RequestHandler = async (req, res, next) => {
  try {
    const params = req.params as SubtaskParams;
    await tasksService.deleteSubtask({
      userId: getAuthenticatedUserId(req),
      taskId: params.taskId,
      subtaskId: params.subtaskId,
    });

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
};
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCodes } from '../../common/errors/error-codes.js';
import {
  tasksRepository,
  type SubtaskRecord,
  type TaskDetailRecord,
  type TaskSummaryRecord,
  type TasksRepository,
} from './tasks.repository.js';
import type {
  CreateSubtaskInput,
  CreateTaskInput,
  DeleteSubtaskInput,
  DeleteTaskInput,
  SubtaskResult,
  TaskDetailResult,
  TaskListResult,
  TaskSummaryResult,
  UpdateSubtaskInput,
  UpdateTaskInput,
} from './tasks.types.js';

export class TasksService {
  public constructor(private readonly repository: TasksRepository = tasksRepository) {}

  public async createTask(input: CreateTaskInput): Promise<TaskDetailResult> {
    const task = await this.repository.createTaskForUser({
      userId: input.userId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      status: input.status,
    });

    if (!task) {
      throw this.createPersonalSpaceMissingError();
    }

    return this.toTaskDetailResult(task);
  }

  public async listTasks(userId: string): Promise<TaskListResult> {
    const tasks = await this.repository.listTasksForUser(userId);

    if (!tasks) {
      throw this.createPersonalSpaceMissingError();
    }

    return {
      tasks: tasks.map((task) => this.toTaskSummaryResult(task)),
    };
  }

  public async getTask(userId: string, taskId: string): Promise<TaskDetailResult> {
    const task = await this.repository.findTaskForUser(userId, taskId);

    if (!task) {
      throw this.createTaskNotFoundError();
    }

    return this.toTaskDetailResult(task);
  }

  public async updateTask(input: UpdateTaskInput): Promise<TaskDetailResult> {
    const task = await this.repository.updateTaskForUser(input.userId, input.taskId, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status,
    });

    if (!task) {
      throw this.createTaskNotFoundError();
    }

    return this.toTaskDetailResult(task);
  }

  public async deleteTask(input: DeleteTaskInput): Promise<void> {
    const deleted = await this.repository.deleteTaskForUser(input.userId, input.taskId);

    if (!deleted) {
      throw this.createTaskNotFoundError();
    }
  }

  public async createSubtask(input: CreateSubtaskInput): Promise<SubtaskResult> {
    const subtask = await this.repository.createSubtaskForUser(input);

    if (!subtask) {
      throw this.createTaskNotFoundError();
    }

    return this.toSubtaskResult(subtask);
  }

  public async updateSubtask(input: UpdateSubtaskInput): Promise<SubtaskResult> {
    const subtask = await this.repository.updateSubtaskForUser(
      input.userId,
      input.taskId,
      input.subtaskId,
      {
        title: input.title,
        status: input.status,
        position: input.position,
      },
    );

    if (!subtask) {
      throw this.createTaskOrSubtaskNotFoundError();
    }

    return this.toSubtaskResult(subtask);
  }

  public async deleteSubtask(input: DeleteSubtaskInput): Promise<void> {
    const deleted = await this.repository.deleteSubtaskForUser(
      input.userId,
      input.taskId,
      input.subtaskId,
    );

    if (!deleted) {
      throw this.createTaskOrSubtaskNotFoundError();
    }
  }

  private toTaskSummaryResult(task: TaskSummaryRecord): TaskSummaryResult {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toTaskDetailResult(task: TaskDetailRecord): TaskDetailResult {
    return {
      ...this.toTaskSummaryResult(task),
      subtasks: task.subtasks.map((subtask) => this.toSubtaskResult(subtask)),
    };
  }

  private toSubtaskResult(subtask: SubtaskRecord): SubtaskResult {
    return {
      id: subtask.id,
      taskId: subtask.taskId,
      title: subtask.title,
      status: subtask.status,
      position: subtask.position,
      createdAt: subtask.createdAt.toISOString(),
      updatedAt: subtask.updatedAt.toISOString(),
    };
  }

  private createPersonalSpaceMissingError(): AppError {
    return new AppError({
      code: ErrorCodes.NotFound,
      message: 'Personal Space not found',
      statusCode: 404,
    });
  }

  private createTaskNotFoundError(): AppError {
    return new AppError({
      code: ErrorCodes.NotFound,
      message: 'Task not found',
      statusCode: 404,
    });
  }

  private createTaskOrSubtaskNotFoundError(): AppError {
    return new AppError({
      code: ErrorCodes.NotFound,
      message: 'Task or Subtask not found',
      statusCode: 404,
    });
  }
}

export const tasksService = new TasksService();
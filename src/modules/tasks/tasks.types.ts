import type { SubtaskStatus, TaskPriority, TaskStatus } from '@prisma/client';

export interface CreateTaskInput {
  userId: string;
  title: string;
  description?: string | undefined;
  priority?: TaskPriority | undefined;
  status?: TaskStatus | undefined;
}

export interface UpdateTaskInput {
  userId: string;
  taskId: string;
  title?: string | undefined;
  description?: string | null | undefined;
  priority?: TaskPriority | undefined;
  status?: TaskStatus | undefined;
}

export interface DeleteTaskInput {
  userId: string;
  taskId: string;
}

export interface CreateSubtaskInput {
  userId: string;
  taskId: string;
  title: string;
  position?: number | undefined;
}

export interface UpdateSubtaskInput {
  userId: string;
  taskId: string;
  subtaskId: string;
  title?: string | undefined;
  status?: SubtaskStatus | undefined;
  position?: number | undefined;
}

export interface DeleteSubtaskInput {
  userId: string;
  taskId: string;
  subtaskId: string;
}

export interface TaskSummaryResult {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}

export interface SubtaskResult {
  id: string;
  taskId: string;
  title: string;
  status: SubtaskStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetailResult extends TaskSummaryResult {
  subtasks: SubtaskResult[];
}

export interface TaskListResult {
  tasks: TaskSummaryResult[];
}
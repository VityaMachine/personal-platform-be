import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from '../../infrastructure/database/prisma.js';

const taskSummarySelect = Prisma.validator<Prisma.TaskSelect>()({
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
});

const subtaskOrderBy = Prisma.validator<Prisma.SubtaskOrderByWithRelationInput[]>()([
  { position: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
]);

const taskDetailInclude = Prisma.validator<Prisma.TaskInclude>()({
  subtasks: {
    orderBy: subtaskOrderBy,
  },
});

export type TaskSummaryRecord = Prisma.TaskGetPayload<{ select: typeof taskSummarySelect }>;
export type TaskDetailRecord = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;
export type SubtaskRecord = Prisma.SubtaskGetPayload<Record<string, never>>;

interface CreateTaskData {
  userId: string;
  title: string;
  description?: string | null | undefined;
  priority?: Prisma.TaskCreateInput['priority'];
  status?: Prisma.TaskCreateInput['status'];
}

interface UpdateTaskData {
  title?: string | undefined;
  description?: string | null | undefined;
  priority?: Prisma.TaskUpdateInput['priority'];
  status?: Prisma.TaskUpdateInput['status'];
}

interface CreateSubtaskData {
  userId: string;
  taskId: string;
  title: string;
  position?: number | undefined;
}

interface UpdateSubtaskData {
  title?: string | undefined;
  status?: Prisma.SubtaskUpdateInput['status'];
  position?: number | undefined;
}

export class TasksRepository {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async createTaskForUser(input: CreateTaskData): Promise<TaskDetailRecord | null> {
    return this.client.$transaction(async (tx) => {
      const personalSpaceId = await this.findPersonalSpaceId(input.userId, tx);
      if (!personalSpaceId) {
        return null;
      }

      const data: Prisma.TaskCreateInput = {
        title: input.title,
        description: input.description ?? null,
        taskSpaces: {
          create: {
            spaceId: personalSpaceId,
          },
        },
      };

      if (input.priority !== undefined) {
        data.priority = input.priority;
      }

      if (input.status !== undefined) {
        data.status = input.status;
      }

      return tx.task.create({
        data,
        include: taskDetailInclude,
      });
    });
  }

  public async listTasksForUser(userId: string): Promise<TaskSummaryRecord[] | null> {
    const personalSpaceId = await this.findPersonalSpaceId(userId);
    if (!personalSpaceId) {
      return null;
    }

    return this.client.task.findMany({
      where: this.taskForSpaceWhere(personalSpaceId),
      select: taskSummarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  public async findTaskForUser(userId: string, taskId: string): Promise<TaskDetailRecord | null> {
    const personalSpaceId = await this.findPersonalSpaceId(userId);
    if (!personalSpaceId) {
      return null;
    }

    return this.findTaskForSpace(taskId, personalSpaceId, this.client);
  }

  public async updateTaskForUser(
    userId: string,
    taskId: string,
    data: UpdateTaskData,
  ): Promise<TaskDetailRecord | null> {
    return this.client.$transaction(async (tx) => {
      const personalSpaceId = await this.findPersonalSpaceId(userId, tx);
      if (!personalSpaceId) {
        return null;
      }

      const updateData = this.toTaskUpdateData(data);
      const result = await tx.task.updateMany({
        where: {
          id: taskId,
          ...this.taskForSpaceWhere(personalSpaceId),
        },
        data: updateData,
      });

      if (result.count !== 1) {
        return null;
      }

      return this.findTaskForSpace(taskId, personalSpaceId, tx);
    });
  }

  public async deleteTaskForUser(userId: string, taskId: string): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      const personalSpaceId = await this.findPersonalSpaceId(userId, tx);
      if (!personalSpaceId) {
        return false;
      }

      const result = await tx.task.deleteMany({
        where: {
          id: taskId,
          ...this.taskForSpaceWhere(personalSpaceId),
        },
      });

      return result.count === 1;
    });
  }

  public async createSubtaskForUser(input: CreateSubtaskData): Promise<SubtaskRecord | null> {
    return this.client.$transaction(async (tx) => {
      const personalSpaceId = await this.findPersonalSpaceId(input.userId, tx);
      if (!personalSpaceId) {
        return null;
      }

      const taskExists = await tx.task.count({
        where: {
          id: input.taskId,
          ...this.taskForSpaceWhere(personalSpaceId),
        },
      });

      if (taskExists !== 1) {
        return null;
      }

      const position = input.position ?? (await this.nextSubtaskPosition(input.taskId, tx));

      return tx.subtask.create({
        data: {
          taskId: input.taskId,
          title: input.title,
          position,
        },
      });
    });
  }

  public async updateSubtaskForUser(
    userId: string,
    taskId: string,
    subtaskId: string,
    data: UpdateSubtaskData,
  ): Promise<SubtaskRecord | null> {
    return this.client.$transaction(async (tx) => {
      const personalSpaceId = await this.findPersonalSpaceId(userId, tx);
      if (!personalSpaceId) {
        return null;
      }

      const updateData = this.toSubtaskUpdateData(data);
      const result = await tx.subtask.updateMany({
        where: {
          id: subtaskId,
          taskId,
          task: this.taskForSpaceWhere(personalSpaceId),
        },
        data: updateData,
      });

      if (result.count !== 1) {
        return null;
      }

      return this.findSubtaskForTask(taskId, subtaskId, tx);
    });
  }

  public async deleteSubtaskForUser(
    userId: string,
    taskId: string,
    subtaskId: string,
  ): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      const personalSpaceId = await this.findPersonalSpaceId(userId, tx);
      if (!personalSpaceId) {
        return false;
      }

      const result = await tx.subtask.deleteMany({
        where: {
          id: subtaskId,
          taskId,
          task: this.taskForSpaceWhere(personalSpaceId),
        },
      });

      return result.count === 1;
    });
  }

  private toTaskUpdateData(data: UpdateTaskData): Prisma.TaskUpdateManyMutationInput {
    const updateData: Prisma.TaskUpdateManyMutationInput = {};

    if (data.title !== undefined) {
      updateData.title = data.title;
    }

    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    if (data.priority !== undefined) {
      updateData.priority = data.priority;
    }

    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    return updateData;
  }

  private toSubtaskUpdateData(data: UpdateSubtaskData): Prisma.SubtaskUpdateManyMutationInput {
    const updateData: Prisma.SubtaskUpdateManyMutationInput = {};

    if (data.title !== undefined) {
      updateData.title = data.title;
    }

    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    if (data.position !== undefined) {
      updateData.position = data.position;
    }

    return updateData;
  }
  private async findPersonalSpaceId(
    userId: string,
    tx: Prisma.TransactionClient | PrismaClient = this.client,
  ): Promise<string | null> {
    const personalSpace = await tx.space.findFirst({
      where: {
        ownerId: userId,
        type: 'PERSONAL',
      },
      select: { id: true },
    });

    return personalSpace?.id ?? null;
  }

  private taskForSpaceWhere(spaceId: string): Prisma.TaskWhereInput {
    return {
      taskSpaces: {
        some: {
          spaceId,
        },
      },
    };
  }

  private async findTaskForSpace(
    taskId: string,
    spaceId: string,
    tx: Prisma.TransactionClient | PrismaClient,
  ): Promise<TaskDetailRecord | null> {
    return tx.task.findFirst({
      where: {
        id: taskId,
        ...this.taskForSpaceWhere(spaceId),
      },
      include: taskDetailInclude,
    });
  }

  private async findSubtaskForTask(
    taskId: string,
    subtaskId: string,
    tx: Prisma.TransactionClient | PrismaClient,
  ): Promise<SubtaskRecord | null> {
    return tx.subtask.findFirst({
      where: {
        id: subtaskId,
        taskId,
      },
    });
  }

  private async nextSubtaskPosition(
    taskId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await tx.subtask.aggregate({
      where: { taskId },
      _max: { position: true },
    });

    return (result._max.position ?? -1) + 1;
  }
}

export const tasksRepository = new TasksRepository();
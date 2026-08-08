/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { createApp } from '../src/app.js';
import { tokenService } from '../src/modules/auth/token.service.js';

type App = ReturnType<typeof createApp>;

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/personal_platform_test';

let app: App;
let prisma: PrismaClient;
const createdUserIds = new Set<string>();

interface TestUser {
  id: string;
  email: string;
  spaceId: string;
  sessionId: string;
  accessToken: string;
}

function assertSafeTestDatabase(url: string): void {
  const databaseName = new URL(url).pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run Tasks integration tests against non-test database: ${databaseName}`);
  }
}

function runMigrations(): void {
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
    },
    shell: true,
    stdio: 'pipe',
  });
}

async function cleanupCreatedUsers(): Promise<void> {
  if (!createdUserIds.size) {
    return;
  }

  const userIds = [...createdUserIds];

  await prisma.task.deleteMany({
    where: {
      taskSpaces: {
        some: {
          space: {
            OR: [
              { ownerId: { in: userIds } },
              { members: { some: { userId: { in: userIds } } } },
            ],
          },
        },
      },
    },
  });

  await prisma.space.deleteMany({
    where: {
      OR: [
        { ownerId: { in: userIds } },
        { members: { some: { userId: { in: userIds } } } },
      ],
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: { in: userIds },
    },
  });

  createdUserIds.clear();
}

async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}.${Date.now()}.${crypto.randomUUID()}@example.com`;

  const user = await prisma.user.create({
    data: {
      email,
      isEmailVerified: true,
      profile: {
        create: {
          displayName: label,
        },
      },
      settings: {
        create: {},
      },
    },
  });
  createdUserIds.add(user.id);

  const space = await prisma.space.create({
    data: {
      name: 'Personal',
      type: 'PERSONAL',
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
          role: 'OWNER',
        },
      },
    },
  });

  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  const accessToken = tokenService.signAccessToken({
    sub: user.id,
    email,
    role: 'USER',
    sessionId: session.id,
    type: 'access',
  });

  return {
    id: user.id,
    email,
    spaceId: space.id,
    sessionId: session.id,
    accessToken,
  };
}

function auth(user: TestUser) {
  return { authorization: `Bearer ${user.accessToken}` };
}

async function createTask(user: TestUser, title = `Task ${crypto.randomUUID()}`) {
  const response = await request(app)
    .post('/api/v1/tasks')
    .set(auth(user))
    .send({ title })
    .expect(201);

  return response.body as { id: string; status: string; priority: string; subtasks: unknown[] };
}

async function expectDatabaseRejection(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toBeDefined();
}

describe('Tasks v0 API', () => {
  beforeAll(
    async () => {
      assertSafeTestDatabase(testDatabaseUrl);
      process.env.NODE_ENV = 'test';
      process.env.PORT = '4000';
      process.env.DATABASE_URL = testDatabaseUrl;
      process.env.TEST_DATABASE_URL = testDatabaseUrl;
      process.env.CORS_ORIGIN = 'http://localhost:3000';
      process.env.LOG_LEVEL = 'silent';
      process.env.BCRYPT_SALT_ROUNDS = '10';
      process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = '60';
      process.env.FRONTEND_URL = 'http://localhost:3000';

      runMigrations();

      const appModule = await import('../src/app.js');
      app = appModule.createApp();
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: testDatabaseUrl,
          },
        },
      });
    },
    30_000,
  );

  beforeEach(async () => {
    await cleanupCreatedUsers();
  });

  afterAll(async () => {
    await cleanupCreatedUsers();
    await prisma.$disconnect();
  });

  it.each([
    ['GET', '/api/v1/tasks'],
    ['POST', '/api/v1/tasks'],
    ['GET', '/api/v1/tasks/missing-task'],
    ['PATCH', '/api/v1/tasks/missing-task'],
    ['DELETE', '/api/v1/tasks/missing-task'],
    ['POST', '/api/v1/tasks/missing-task/subtasks'],
    ['PATCH', '/api/v1/tasks/missing-task/subtasks/missing-subtask'],
    ['DELETE', '/api/v1/tasks/missing-task/subtasks/missing-subtask'],
  ])('returns 401 for unauthenticated %s %s', async (method, path) => {
    const agent = request(app);
    const response =
      method === 'GET'
        ? await agent.get(path)
        : method === 'POST'
          ? await agent.post(path).send({ title: 'Task' })
          : method === 'PATCH'
            ? await agent.patch(path).send({ title: 'Task' })
            : await agent.delete(path);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('creates a Task with defaults, Personal Space association, and zero Subtasks', async () => {
    const user = await createTestUser('task-create');

    const response = await request(app)
      .post('/api/v1/tasks')
      .set(auth(user))
      .send({ title: '  Plan weekend  ' })
      .expect(201);

    expect(response.body).toMatchObject({
      title: 'Plan weekend',
      description: null,
      status: 'TODO',
      priority: 'LOW',
      subtasks: [],
    });

    const taskSpace = await prisma.taskSpace.findFirst({
      where: { taskId: response.body.id },
    });
    expect(taskSpace).toMatchObject({
      taskId: response.body.id,
      spaceId: user.spaceId,
    });

    await expect(prisma.subtask.count({ where: { taskId: response.body.id } })).resolves.toBe(0);
  });

  it('rejects a blank Task title', async () => {
    const user = await createTestUser('blank-title');

    const response = await request(app)
      .post('/api/v1/tasks')
      .set(auth(user))
      .send({ title: '   ' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lists only the authenticated User personal Tasks', async () => {
    const userA = await createTestUser('list-a');
    const userB = await createTestUser('list-b');
    const taskA = await createTask(userA, 'Visible Task');
    await createTask(userB, 'Hidden Task');

    const response = await request(app).get('/api/v1/tasks').set(auth(userA)).expect(200);

    expect(response.body.tasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: taskA.id, title: 'Visible Task' })]),
    );
    expect(response.body.tasks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Hidden Task' })]),
    );
    expect(response.body.tasks[0]).not.toHaveProperty('subtasks');
  });

  it('gets a Task with Subtasks ordered by position, createdAt, and id', async () => {
    const user = await createTestUser('get-detail');
    const task = await createTask(user);

    await request(app)
      .post(`/api/v1/tasks/${task.id}/subtasks`)
      .set(auth(user))
      .send({ title: 'Second', position: 2 })
      .expect(201);
    await request(app)
      .post(`/api/v1/tasks/${task.id}/subtasks`)
      .set(auth(user))
      .send({ title: 'First', position: 1 })
      .expect(201);

    const response = await request(app).get(`/api/v1/tasks/${task.id}`).set(auth(user)).expect(200);

    expect(response.body.subtasks.map((subtask: { title: string }) => subtask.title)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('returns 404 for missing or inaccessible Tasks', async () => {
    const userA = await createTestUser('missing-a');
    const userB = await createTestUser('missing-b');
    const taskB = await createTask(userB);

    await request(app).get('/api/v1/tasks/cmissingtask000000000000').set(auth(userA)).expect(404);
    await request(app).get(`/api/v1/tasks/${taskB.id}`).set(auth(userA)).expect(404);
  });

  it('updates Task title, description, priority, and status', async () => {
    const user = await createTestUser('task-update');
    const task = await createTask(user);

    const titleResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(user))
      .send({ title: 'Updated title' })
      .expect(200);
    expect(titleResponse.body.title).toBe('Updated title');

    const descriptionResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(user))
      .send({ description: 'Updated description' })
      .expect(200);
    expect(descriptionResponse.body.description).toBe('Updated description');

    const priorityResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(user))
      .send({ priority: 'URGENT' })
      .expect(200);
    expect(priorityResponse.body.priority).toBe('URGENT');

    const inProgressResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(user))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(inProgressResponse.body.status).toBe('IN_PROGRESS');

    const doneResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(user))
      .send({ status: 'DONE' })
      .expect(200);
    expect(doneResponse.body.status).toBe('DONE');
  });

  it('rejects an empty Task PATCH body', async () => {
    const user = await createTestUser('empty-patch');
    const task = await createTask(user);

    const response = await request(app)
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(user))
      .send({})
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('prevents User A from updating or deleting User B Task', async () => {
    const userA = await createTestUser('isolated-a');
    const userB = await createTestUser('isolated-b');
    const taskB = await createTask(userB);

    await request(app)
      .patch(`/api/v1/tasks/${taskB.id}`)
      .set(auth(userA))
      .send({ title: 'Nope' })
      .expect(404);

    await request(app).delete(`/api/v1/tasks/${taskB.id}`).set(auth(userA)).expect(404);

    await expect(prisma.task.findUnique({ where: { id: taskB.id } })).resolves.not.toBeNull();
  });

  it('hard deletes a Task and cascades TaskSpace and Subtasks', async () => {
    const user = await createTestUser('task-delete');
    const task = await createTask(user);
    const subtaskResponse = await request(app)
      .post(`/api/v1/tasks/${task.id}/subtasks`)
      .set(auth(user))
      .send({ title: 'Child' })
      .expect(201);

    await request(app).delete(`/api/v1/tasks/${task.id}`).set(auth(user)).expect(204);

    await expect(prisma.task.findUnique({ where: { id: task.id } })).resolves.toBeNull();
    await expect(prisma.taskSpace.count({ where: { taskId: task.id } })).resolves.toBe(0);
    await expect(prisma.subtask.findUnique({ where: { id: subtaskResponse.body.id } })).resolves.toBeNull();
    await request(app).get(`/api/v1/tasks/${task.id}`).set(auth(user)).expect(404);
  });

  it('creates Subtasks with appended and explicit positions', async () => {
    const user = await createTestUser('subtask-create');
    const task = await createTask(user);

    const first = await request(app)
      .post(`/api/v1/tasks/${task.id}/subtasks`)
      .set(auth(user))
      .send({ title: 'First' })
      .expect(201);
    const explicit = await request(app)
      .post(`/api/v1/tasks/${task.id}/subtasks`)
      .set(auth(user))
      .send({ title: 'Explicit', position: 5 })
      .expect(201);
    const appended = await request(app)
      .post(`/api/v1/tasks/${task.id}/subtasks`)
      .set(auth(user))
      .send({ title: 'Appended' })
      .expect(201);

    expect(first.body.position).toBe(0);
    expect(explicit.body.position).toBe(5);
    expect(appended.body.position).toBe(6);
  });

  it('updates Subtask title, position, and status', async () => {
    const user = await createTestUser('subtask-update');
    const task = await createTask(user);
    const subtask = await request(app)
      .post(`/api/v1/tasks/${task.id}/subtasks`)
      .set(auth(user))
      .send({ title: 'Original' })
      .expect(201);

    const titleResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}/subtasks/${subtask.body.id}`)
      .set(auth(user))
      .send({ title: 'Renamed' })
      .expect(200);
    expect(titleResponse.body.title).toBe('Renamed');

    const positionResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}/subtasks/${subtask.body.id}`)
      .set(auth(user))
      .send({ position: 3 })
      .expect(200);
    expect(positionResponse.body.position).toBe(3);

    const inProgressResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}/subtasks/${subtask.body.id}`)
      .set(auth(user))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(inProgressResponse.body.status).toBe('IN_PROGRESS');

    const doneResponse = await request(app)
      .patch(`/api/v1/tasks/${task.id}/subtasks/${subtask.body.id}`)
      .set(auth(user))
      .send({ status: 'DONE' })
      .expect(200);
    expect(doneResponse.body.status).toBe('DONE');
  });

  it('deletes a Subtask', async () => {
    const user = await createTestUser('subtask-delete');
    const task = await createTask(user);
    const subtask = await request(app)
      .post(`/api/v1/tasks/${task.id}/subtasks`)
      .set(auth(user))
      .send({ title: 'Delete me' })
      .expect(201);

    await request(app)
      .delete(`/api/v1/tasks/${task.id}/subtasks/${subtask.body.id}`)
      .set(auth(user))
      .expect(204);

    await expect(prisma.subtask.findUnique({ where: { id: subtask.body.id } })).resolves.toBeNull();
  });

  it('returns 404 for Subtask/task mismatch and other-user Subtask operations', async () => {
    const userA = await createTestUser('subtask-isolated-a');
    const userB = await createTestUser('subtask-isolated-b');
    const taskA = await createTask(userA);
    const taskB = await createTask(userB);
    const subtaskB = await request(app)
      .post(`/api/v1/tasks/${taskB.id}/subtasks`)
      .set(auth(userB))
      .send({ title: 'Private child' })
      .expect(201);

    await request(app)
      .post(`/api/v1/tasks/${taskB.id}/subtasks`)
      .set(auth(userA))
      .send({ title: 'No access' })
      .expect(404);

    await request(app)
      .patch(`/api/v1/tasks/${taskB.id}/subtasks/${subtaskB.body.id}`)
      .set(auth(userA))
      .send({ title: 'Nope' })
      .expect(404);

    await request(app)
      .delete(`/api/v1/tasks/${taskB.id}/subtasks/${subtaskB.body.id}`)
      .set(auth(userA))
      .expect(404);

    await request(app)
      .patch(`/api/v1/tasks/${taskA.id}/subtasks/${subtaskB.body.id}`)
      .set(auth(userA))
      .send({ title: 'Mismatch' })
      .expect(404);
  });
});

describe('Tasks v0 database constraints', () => {
  it('rejects duplicate TaskSpace records for the same Task and Space', async () => {
    const user = await createTestUser('duplicate-taskspace');
    const task = await prisma.task.create({ data: { title: 'DB Task' } });
    await prisma.taskSpace.create({ data: { taskId: task.id, spaceId: user.spaceId } });

    await expectDatabaseRejection(
      prisma.taskSpace.create({ data: { taskId: task.id, spaceId: user.spaceId } }),
    );
  });

  it('rejects blank Task and Subtask titles at DB level', async () => {
    const task = await prisma.task.create({ data: { title: 'Parent' } });

    await expectDatabaseRejection(prisma.task.create({ data: { title: '   ' } }));
    await expectDatabaseRejection(
      prisma.subtask.create({ data: { taskId: task.id, title: '   ', position: 0 } }),
    );
  });

  it('rejects negative Subtask position', async () => {
    const task = await prisma.task.create({ data: { title: 'Parent' } });

    await expectDatabaseRejection(
      prisma.subtask.create({ data: { taskId: task.id, title: 'Child', position: -1 } }),
    );
  });

  it('cascades Task deletion to TaskSpace and Subtask', async () => {
    const user = await createTestUser('db-cascade');
    const task = await prisma.task.create({ data: { title: 'Cascade Task' } });
    await prisma.taskSpace.create({ data: { taskId: task.id, spaceId: user.spaceId } });
    const subtask = await prisma.subtask.create({
      data: { taskId: task.id, title: 'Cascade Subtask', position: 0 },
    });

    await prisma.task.delete({ where: { id: task.id } });

    await expect(prisma.taskSpace.count({ where: { taskId: task.id } })).resolves.toBe(0);
    await expect(prisma.subtask.findUnique({ where: { id: subtask.id } })).resolves.toBeNull();
  });

  it('restricts Space deletion while TaskSpace exists', async () => {
    const user = await createTestUser('space-restrict');
    const task = await prisma.task.create({ data: { title: 'Restrict Task' } });
    await prisma.taskSpace.create({ data: { taskId: task.id, spaceId: user.spaceId } });

    await expectDatabaseRejection(prisma.space.delete({ where: { id: user.spaceId } }));
  });
});
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import type { createApp } from '../src/app.js';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
  };
}

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/personal_platform_test';
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';

  const appModule = await import('../src/app.js');
  app = appModule.createApp();
});

describe('health routes', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    const body = response.body as HealthResponse;

    expect(body).toMatchObject({
      status: 'ok',
    });
    expect(body.timestamp).toEqual(expect.any(String));
    expect(body.uptime).toEqual(expect.any(Number));
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('returns standard error for an unknown route', async () => {
    const response = await request(app).get('/api/v1/unknown').expect(404);
    const body = response.body as ErrorResponse;

    expect(body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        details: [],
      },
    });
    expect(body.error.requestId).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toEqual(body.error.requestId);
  });
});

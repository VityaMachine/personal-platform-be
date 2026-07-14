import { createRequire } from 'node:module';

import request from 'supertest';
import { z } from 'zod';
import { beforeAll, describe, expect, it } from 'vitest';

import type { createApp } from '../src/app.js';

const require = createRequire(import.meta.url);
const packageJsonSchema = z.object({
  version: z.string().min(1),
});

interface HealthResponse {
  status: 'ok';
  version: string;
  environment: string;
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
let packageVersion: string;
let swaggerDocument: typeof import('../src/config/swagger.js').swaggerDocument;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/personal_platform_test';
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';

  const appModule = await import('../src/app.js');
  const swaggerModule = await import('../src/config/swagger.js');
  const packageJson = packageJsonSchema.parse(require('../package.json') as unknown);

  app = appModule.createApp();
  packageVersion = packageJson.version;
  swaggerDocument = swaggerModule.swaggerDocument;
});

describe('health routes', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    const body = response.body as HealthResponse;

    expect(body).toMatchObject({
      status: 'ok',
      version: packageVersion,
    });
    expect(body.environment).toEqual(expect.any(String));
    expect(body.timestamp).toEqual(expect.any(String));
    expect(body.uptime).toEqual(expect.any(Number));
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('reuses a valid incoming request id', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'test-request-id')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('test-request-id');
  });

  it('replaces an empty incoming request id', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', '   ')
      .expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).not.toBe('');
    expect(response.headers['x-request-id']).not.toBe('   ');
  });

  it('replaces an incoming request id that is too long', async () => {
    const requestId = 'x'.repeat(129);

    const response = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', requestId)
      .expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).not.toBe(requestId);
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

  it('declares bearer auth in OpenAPI without securing health globally', () => {
    expect(swaggerDocument.components?.securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(swaggerDocument.security).toBeUndefined();
    expect(swaggerDocument.paths['/health']?.get?.security).toBeUndefined();
  });
});

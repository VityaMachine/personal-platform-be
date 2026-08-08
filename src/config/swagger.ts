import type { OpenAPIV3 } from 'openapi-types';

import { appConfig } from './app.js';

export const swaggerDocument: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'Personal Platform API',
    version: appConfig.version,
    description: 'Base API contract for the Personal Platform backend.',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1',
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        operationId: 'getHealth',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Application is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status', 'version', 'environment', 'timestamp', 'uptime'],
                  properties: {
                    status: {
                      type: 'string',
                      example: 'ok',
                    },
                    version: {
                      type: 'string',
                      example: appConfig.version,
                    },
                    environment: {
                      type: 'string',
                      enum: ['development', 'test', 'production'],
                      example: 'development',
                    },
                    timestamp: {
                      type: 'string',
                      format: 'date-time',
                      example: '2026-07-14T12:00:00.000Z',
                    },
                    uptime: {
                      type: 'number',
                      example: 120.5,
                    },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register a user with email and password',
        operationId: 'registerUser',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RegisterRequest',
              },
              example: {
                email: 'user@example.com',
                password: 'StrongPassword1!',
                displayName: 'Vitya',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User registered',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RegisterResponse',
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '409': {
            description: 'Email already in use',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/auth/verify-email': {
      post: {
        summary: 'Verify a user email address',
        operationId: 'verifyEmail',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VerifyEmailRequest' },
              example: { token: 'raw verification token' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Email verified successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VerifyEmailResponse' },
              },
            },
          },
          '400': {
            description:
              'Validation error, invalid verification token, or expired verification token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  validation: {
                    value: {
                      error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Request validation failed',
                        details: [],
                        requestId: '00000000-0000-4000-8000-000000000000',
                      },
                    },
                  },
                  invalidToken: {
                    value: {
                      error: {
                        code: 'INVALID_VERIFICATION_TOKEN',
                        message: 'Invalid verification token',
                        details: [],
                        requestId: '00000000-0000-4000-8000-000000000000',
                      },
                    },
                  },
                  expiredToken: {
                    value: {
                      error: {
                        code: 'VERIFICATION_TOKEN_EXPIRED',
                        message: 'Verification token has expired',
                        details: [],
                        requestId: '00000000-0000-4000-8000-000000000000',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Log in with email and password',
        operationId: 'login',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
              example: { email: 'user@example.com', password: 'Test123!' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Invalid email or password',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'Email address is not verified',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate a refresh token and issue a new token pair',
        description:
          'A successful refresh invalidates the supplied refresh token. Only the returned refresh token remains valid.',
        operationId: 'refreshSession',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RefreshRequest' },
              example: { refreshToken: 'raw opaque refresh token' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token pair rotated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Invalid, expired, revoked, or replayed refresh token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'Email address is not verified',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get the authenticated user',
        description:
          'Returns the current user identified by the validated access token and its active AuthSession.',
        operationId: 'getCurrentUser',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CurrentUserResponse' },
              },
            },
          },
          '401': {
            description: 'Missing, malformed, expired, or inactive access token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '404': {
            description: 'Authenticated user no longer exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Log out the session associated with a refresh token',
        description:
          'Revokes the active session associated with the supplied refresh token only when it belongs to the authenticated user. Unknown, expired, revoked, rotated, and other-user refresh tokens receive the same generic authentication error. Protected routes reject the access token associated with the revoked session immediately because access-token authentication validates its active AuthSession.',
        operationId: 'logoutSession',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LogoutRequest' },
              example: { refreshToken: 'raw opaque refresh token' },
            },
          },
        },
        responses: {
          '204': {
            description: 'Logout accepted; the response has no body',
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description:
              'Missing or invalid access token, invalid refresh token, revoked or expired session, or refresh-token ownership mismatch',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/logout-all': {
      post: {
        summary: 'Log out all refresh sessions for the authenticated user',
        description:
          'Revokes every refresh session belonging to the authenticated user. Sessions owned by other users are unaffected. Protected endpoints validate the AuthSession referenced by each access token, so access tokens associated with the deleted sessions can no longer authenticate. No access-token blacklist is used.',
        operationId: 'logoutAllSessions',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          '204': {
            description: 'All refresh sessions were revoked; the response has no body',
          },
          '401': {
            description: 'Missing or invalid access token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/tasks': {
      post: {
        summary: 'Create a personal Task',
        operationId: 'createTask',
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateTaskRequest' },
              example: { title: 'Buy groceries', priority: 'LOW' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Task created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskDetail' } } },
          },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Missing or invalid access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Personal Space not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      get: {
        summary: 'List personal Tasks',
        operationId: 'listTasks',
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Task list',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskListResponse' } } },
          },
          '401': { description: 'Missing or invalid access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Personal Space not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/tasks/{taskId}': {
      get: {
        summary: 'Get a personal Task',
        operationId: 'getTask',
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Task detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskDetail' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Missing or invalid access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Task not found or inaccessible', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      patch: {
        summary: 'Update a personal Task',
        operationId: 'updateTask',
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateTaskRequest' },
              example: { status: 'IN_PROGRESS' },
            },
          },
        },
        responses: {
          '200': { description: 'Task updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskDetail' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Missing or invalid access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Task not found or inaccessible', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        summary: 'Delete a personal Task',
        operationId: 'deleteTask',
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Task deleted; response has no body' },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Missing or invalid access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Task not found or inaccessible', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/tasks/{taskId}/subtasks': {
      post: {
        summary: 'Create a Subtask',
        operationId: 'createSubtask',
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateSubtaskRequest' }, example: { title: 'Buy milk' } } },
        },
        responses: {
          '201': { description: 'Subtask created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Subtask' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Missing or invalid access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Task not found or inaccessible', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/tasks/{taskId}/subtasks/{subtaskId}': {
      patch: {
        summary: 'Update a Subtask',
        operationId: 'updateSubtask',
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'subtaskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateSubtaskRequest' }, example: { status: 'DONE' } } },
        },
        responses: {
          '200': { description: 'Subtask updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Subtask' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Missing or invalid access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Task or Subtask not found or inaccessible', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        summary: 'Delete a Subtask',
        operationId: 'deleteSubtask',
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'subtaskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '204': { description: 'Subtask deleted; response has no body' },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Missing or invalid access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Task or Subtask not found or inaccessible', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      CurrentUserResponse: {
        type: 'object',
        required: ['user'],
        properties: {
          user: {
            type: 'object',
            required: ['id', 'email', 'displayName', 'role', 'createdAt'],
            properties: {
              id: { type: 'string' },
              email: { type: 'string', format: 'email' },
              displayName: { type: 'string', nullable: true },
              role: { type: 'string', enum: ['USER', 'ADMIN'] },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      LogoutRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', minLength: 1 },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', minLength: 1 },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 1, format: 'password' },
        },
      },
      LoginResponse: {
        type: 'object',
        required: ['accessToken', 'refreshToken', 'tokenType', 'expiresIn', 'user'],
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          tokenType: { type: 'string', enum: ['Bearer'] },
          expiresIn: { type: 'integer', example: 900 },
          user: {
            type: 'object',
            required: ['id', 'email', 'role', 'isEmailVerified', 'profile', 'settings'],
            properties: {
              id: { type: 'string' },
              email: { type: 'string', format: 'email' },
              role: { type: 'string', enum: ['USER', 'ADMIN'] },
              isEmailVerified: { type: 'boolean', example: true },
              profile: {
                type: 'object',
                required: ['displayName', 'avatarUrl', 'timeZone'],
                properties: {
                  displayName: { type: 'string' },
                  avatarUrl: { type: 'string', nullable: true },
                  timeZone: { type: 'string', example: 'Europe/Kyiv' },
                },
              },
              settings: {
                type: 'object',
                required: ['startOfWeek', 'startupPage', 'locale', 'theme'],
                properties: {
                  startOfWeek: { type: 'string', enum: ['MONDAY', 'SUNDAY'] },
                  startupPage: {
                    type: 'string',
                    enum: ['DASHBOARD', 'CALENDAR', 'TASKS'],
                  },
                  locale: { type: 'string', enum: ['UK', 'EN'] },
                  theme: { type: 'string', enum: ['SYSTEM', 'LIGHT', 'DARK'] },
                },
              },
            },
          },
        },
      },
      VerifyEmailRequest: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 1 },
        },
      },
      VerifyEmailResponse: {
        type: 'object',
        required: ['message', 'user'],
        properties: {
          message: { type: 'string', example: 'Email verified successfully' },
          user: {
            type: 'object',
            required: ['id', 'email', 'isEmailVerified'],
            properties: {
              id: { type: 'string' },
              email: { type: 'string', format: 'email' },
              isEmailVerified: { type: 'boolean', example: true },
            },
          },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'displayName'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 254,
          },
          password: {
            type: 'string',
            minLength: 8,
            format: 'password',
          },
          displayName: {
            type: 'string',
            minLength: 3,
            maxLength: 50,
          },
        },
      },
      RegisterResponse: {
        type: 'object',
        required: ['id', 'email', 'isEmailVerified', 'profile', 'settings', 'createdAt'],
        properties: {
          id: {
            type: 'string',
          },
          email: {
            type: 'string',
            format: 'email',
          },
          isEmailVerified: {
            type: 'boolean',
            example: false,
          },
          profile: {
            type: 'object',
            required: ['displayName', 'timeZone'],
            properties: {
              displayName: {
                type: 'string',
                example: 'Vitya',
              },
              timeZone: {
                type: 'string',
                example: 'Europe/Kyiv',
              },
            },
          },
          settings: {
            type: 'object',
            required: ['startOfWeek', 'startupPage', 'locale', 'theme'],
            properties: {
              startOfWeek: {
                type: 'string',
                enum: ['MONDAY', 'SUNDAY'],
                example: 'MONDAY',
              },
              startupPage: {
                type: 'string',
                enum: ['DASHBOARD', 'CALENDAR', 'TASKS'],
                example: 'DASHBOARD',
              },
              locale: {
                type: 'string',
                enum: ['UK', 'EN'],
                example: 'UK',
              },
              theme: {
                type: 'string',
                enum: ['SYSTEM', 'LIGHT', 'DARK'],
                example: 'SYSTEM',
              },
            },
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message', 'details', 'requestId'],
            properties: {
              code: {
                type: 'string',
                example: 'NOT_FOUND',
              },
              message: {
                type: 'string',
                example: 'Route not found',
              },
              details: {
                type: 'array',
                items: {},
                example: [],
              },
              requestId: {
                type: 'string',
                format: 'uuid',
              },
            },
          },
        },
      },
    },
  },
};

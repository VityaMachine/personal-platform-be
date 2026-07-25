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

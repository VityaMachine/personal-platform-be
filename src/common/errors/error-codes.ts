export const ErrorCodes = {
  InternalServerError: 'INTERNAL_SERVER_ERROR',
  NotFound: 'NOT_FOUND',
  ValidationError: 'VALIDATION_ERROR',
  EmailAlreadyInUse: 'EMAIL_ALREADY_IN_USE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

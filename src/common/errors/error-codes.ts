export const ErrorCodes = {
  InternalServerError: 'INTERNAL_SERVER_ERROR',
  NotFound: 'NOT_FOUND',
  ValidationError: 'VALIDATION_ERROR',
  EmailAlreadyInUse: 'EMAIL_ALREADY_IN_USE',
  InvalidVerificationToken: 'INVALID_VERIFICATION_TOKEN',
  VerificationTokenExpired: 'VERIFICATION_TOKEN_EXPIRED',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  EmailNotVerified: 'EMAIL_NOT_VERIFIED',
  InvalidRefreshToken: 'INVALID_REFRESH_TOKEN',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

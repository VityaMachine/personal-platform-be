export class AppError extends Error {
  public readonly code: string;

  public readonly statusCode: number;

  public readonly details: unknown;

  public constructor(params: {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details ?? [];
  }
}

import type { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        sessionId: string;
        role: UserRole;
      };
    }
  }
}

declare module 'node:http' {
  interface IncomingMessage {
    requestId?: string;
  }
}

export {};

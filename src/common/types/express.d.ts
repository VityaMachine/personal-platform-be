declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        sessionId: string;
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

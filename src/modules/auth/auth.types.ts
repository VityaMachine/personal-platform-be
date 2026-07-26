import type { Locale, StartOfWeek, StartupPage, Theme, UserRole } from '@prisma/client';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface RegisterResult {
  id: string;
  email: string;
  isEmailVerified: boolean;
  profile: {
    displayName: string;
    timeZone: string;
  };
  settings: {
    startOfWeek: StartOfWeek;
    startupPage: StartupPage;
    locale: Locale;
    theme: Theme;
  };
  createdAt: string;
}

export interface UserRegisteredEvent {
  userId: string;
  email: string;
  occurredAt: string;
}

export interface VerifyEmailResult {
  message: 'Email verified successfully';
  user: {
    id: string;
    email: string;
    isEmailVerified: true;
  };
}

export interface EmailVerifiedEvent {
  userId: string;
  email: string;
  verifiedAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: {
    id: string;
    email: string;
    role: UserRole;
    isEmailVerified: true;
    profile: {
      displayName: string;
      avatarUrl: string | null;
      timeZone: string;
    };
    settings: {
      startOfWeek: StartOfWeek;
      startupPage: StartupPage;
      locale: Locale;
      theme: Theme;
    };
  };
}

export interface UserLoggedInEvent {
  userId: string;
  email: string;
  sessionId: string;
  loggedInAt: string;
}

export interface RefreshInput {
  refreshToken: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface SessionRefreshedEvent {
  userId: string;
  email: string;
  sessionId: string;
  refreshedAt: string;
}

export interface LogoutInput {
  refreshToken: string;
}

export interface UserLoggedOutEvent {
  userId: string;
  sessionId: string;
  loggedOutAt: string;
}

export interface AllSessionsLoggedOutEvent {
  userId: string;
  occurredAt: string;
}

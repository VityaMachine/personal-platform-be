import type { Locale, StartOfWeek, StartupPage, Theme } from '@prisma/client';

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

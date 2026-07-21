import type { Locale, StartOfWeek, StartupPage, Theme } from '@prisma/client';

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string | null;
}

export interface RegisterResult {
  id: string;
  email: string;
  isEmailVerified: boolean;
  profile: {
    displayName: string | null;
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

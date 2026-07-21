export interface SendEmailVerificationInput {
  email: string;
  verificationUrl: string;
}

export interface EmailProvider {
  sendEmailVerification(input: SendEmailVerificationInput): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  public sendEmailVerification(input: SendEmailVerificationInput): Promise<void> {
    console.info(`[EMAIL_STUB] Verify email for ${input.email}:`);
    console.info(input.verificationUrl);

    return Promise.resolve();
  }
}

export const emailProvider = new ConsoleEmailProvider();

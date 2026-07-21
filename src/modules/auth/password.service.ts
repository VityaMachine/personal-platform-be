import bcrypt from 'bcrypt';

import { env } from '../../config/env.js';

export class PasswordService {
  public async hash(password: string): Promise<string> {
    return bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  }

  public async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

export const passwordService = new PasswordService();

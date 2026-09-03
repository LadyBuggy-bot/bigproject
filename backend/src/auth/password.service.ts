import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    return `scrypt$32768$8$3$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`;
  }

  async verify(password: string, encoded?: string): Promise<boolean> {
    const parts = encoded?.split('$') ?? [];
    const valid =
      parts.length === 6 &&
      parts.slice(0, 4).join('$') === 'scrypt$32768$8$3' &&
      /^[0-9a-f]{32}$/.test(parts[4]) &&
      /^[0-9a-f]{128}$/.test(parts[5]);
    // Keep the expensive operation for unknown users too.
    const salt = valid ? Buffer.from(parts[4], 'hex') : Buffer.alloc(16);
    const actual = await derive(password, salt);
    const expected = valid ? Buffer.from(parts[5], 'hex') : Buffer.alloc(64);
    return timingSafeEqual(actual, expected) && valid;
  }
}

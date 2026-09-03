import { ConfigService } from '@nestjs/config';
import { generate, generateSecret } from 'otplib';
import { User } from '@prisma/client';
import { TwoFactorService, credentialHash } from './two-factor.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';

describe('Two-factor security', () => {
  const update = jest.fn();
  const tx = { user: { update } };
  const service = new TwoFactorService(
    {} as PrismaService,
    new ConfigService({ TOTP_ENCRYPTION_KEY: 'ab'.repeat(32) }),
    new PasswordService(),
    {} as AuditService,
  );
  beforeEach(() => {
    update.mockReset();
    update.mockResolvedValue({});
  });
  test('encrypted secrets are randomized, authenticated and bound to the user', () => {
    const a = service.encrypt('SECRET', 'user');
    const b = service.encrypt('SECRET', 'user');
    expect(a).not.toBe(b);
    expect(a).not.toContain('SECRET');
    expect(service.decrypt(a, 'user')).toBe('SECRET');
    expect(() => service.decrypt(a, 'other')).toThrow();
    const parts = a.split('.');
    parts[1] = Buffer.alloc(16).toString('base64url');
    expect(() => service.decrypt(parts.join('.'), 'user')).toThrow();
  });
  test('valid TOTP is accepted once; replay and incorrect code do not update the user', async () => {
    const secret = generateSecret();
    const code = await generate({ secret });
    const user = {
      id: 'user',
      totpSecretEncrypted: service.encrypt(secret, 'user'),
      totpLastStep: null,
      recoveryCodeHashes: [],
    } as unknown as User;
    expect(await service.consumeCode(tx as never, user, code)).toBe(true);
    user.totpLastStep = update.mock.calls[0][0].data.totpLastStep;
    update.mockClear();
    expect(await service.consumeCode(tx as never, user, code)).toBe(false);
    expect(await service.consumeCode(tx as never, user, 'invalid')).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
  test('recovery code is removed atomically and cannot be reused', async () => {
    const code = 'cd'.repeat(16);
    const user = {
      id: 'user',
      totpSecretEncrypted: 'enabled',
      recoveryCodeHashes: [credentialHash(`user:${code}`)],
    } as User;
    expect(await service.consumeCode(tx as never, user, code)).toBe(true);
    user.recoveryCodeHashes = update.mock.calls[0][0].data.recoveryCodeHashes;
    expect(user.recoveryCodeHashes).toEqual([]);
    expect(await service.consumeCode(tx as never, user, code)).toBe(false);
  });
  test('failed challenge consumes an attempt and does not issue authentication', async () => {
    const token = 'aa'.repeat(32);
    const challenge = {
      id: 'c',
      userId: 'u',
      expiresAt: new Date(Date.now() + 100000),
      attempts: 0,
      securityVersion: 0,
      consumedAt: null,
    };
    const updateChallenge = jest.fn();
    const transaction = {
      $queryRaw: jest.fn(),
      authChallenge: {
        findUnique: jest.fn().mockResolvedValue(challenge),
        update: updateChallenge,
      },
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({
            id: 'u',
            status: 'ACTIVE',
            securityVersion: 0,
            deletedAt: null,
            totpSecretEncrypted: null,
          }),
      },
    };
    expect(await service.consumeChallenge(transaction as never, token, '000000')).toBeNull();
    expect(updateChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
    challenge.attempts = 5;
    updateChallenge.mockClear();
    expect(await service.consumeChallenge(transaction as never, token, '000000')).toBeNull();
    expect(updateChallenge).not.toHaveBeenCalled();
  });
  test('password changes invalidate an outstanding challenge', async () => {
    const challenge = {
      id: 'c',
      userId: 'u',
      expiresAt: new Date(Date.now() + 100000),
      attempts: 0,
      securityVersion: 0,
    };
    const transaction = {
      $queryRaw: jest.fn(),
      authChallenge: { findUnique: jest.fn().mockResolvedValue(challenge) },
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'u', status: 'ACTIVE', securityVersion: 1 }),
      },
    };
    expect(
      await service.consumeChallenge(transaction as never, 'aa'.repeat(32), '000000'),
    ).toBeNull();
  });
});

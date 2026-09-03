import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const sid = '22222222-2222-4222-8222-222222222222';
  const findFirst = jest.fn();
  const findUnique = jest.fn();
  const updateMany = jest.fn();
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const tx = { session: { findUnique, updateMany }, $queryRaw: jest.fn().mockResolvedValue([]) };
  const prisma = {
    session: { findFirst },
    $transaction: (work: (transaction: typeof tx) => unknown) => work(tx),
  };
  const jwt = new JwtService({
    secret: 'test-only-secret-with-at-least-32-bytes',
    signOptions: {
      algorithm: 'HS256',
      expiresIn: 900,
      issuer: 'bigproject',
      audience: 'bigproject-api',
    },
    verifyOptions: { algorithms: ['HS256'], issuer: 'bigproject', audience: 'bigproject-api' },
  });
  const auth = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    new PasswordService(),
    audit as unknown as AuditService,
    {} as never,
  );
  const token = () => jwt.sign({ sub: userId, sid, kind: 'access' });
  beforeEach(() => jest.clearAllMocks());

  test('invalid signature rejected before database access', async () => {
    await expect(auth.authenticate(token() + 'x')).rejects.toThrow();
    expect(findFirst).not.toHaveBeenCalled();
  });
  test('expired token and wrong token purpose rejected', async () => {
    await expect(
      auth.authenticate(jwt.sign({ sub: userId, sid, kind: 'access' }, { expiresIn: -1 })),
    ).rejects.toThrow();
    await expect(
      auth.authenticate(jwt.sign({ sub: userId, sid, kind: 'refresh' })),
    ).rejects.toThrow();
  });
  test('revoked session/blocked user fails even with a valid JWT', async () => {
    findFirst.mockResolvedValue(null);
    await expect(auth.authenticate(token())).rejects.toThrow();
    expect(findFirst.mock.calls[0][0].where.user).toEqual({ status: 'ACTIVE', deletedAt: null });
  });
  test('permissions are fresh from the database and AuthUser contains no secrets', async () => {
    findFirst.mockResolvedValue({
      userId,
      user: {
        passwordHash: 'secret',
        roles: [
          {
            role: {
              name: 'CUSTOM',
              permissions: [{ permission: { code: 'deal.read' } }],
            },
          },
        ],
      },
    });
    expect((await auth.authenticate(token())).user).toEqual({
      id: userId,
      roles: ['CUSTOM'],
      permissions: ['deal.read'],
    });
    findFirst.mockResolvedValue({ userId, user: { roles: [] } });
    expect((await auth.authenticate(token())).user.permissions).toEqual([]);
  });
  test('refresh rotation uses compare-and-swap and rejects replay', async () => {
    findUnique.mockResolvedValue({ id: sid, userId });
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const oldToken = sid + '.' + 'a'.repeat(64);
    const tokens = await auth.refresh(oldToken);
    expect(tokens.refreshToken).not.toEqual(oldToken);
    expect(updateMany.mock.calls[0][0].where.refreshTokenHash).not.toBe('a'.repeat(64));
    await expect(auth.refresh(oldToken)).rejects.toThrow();
    expect(audit.log).toHaveBeenCalledTimes(1);
  });
  test('malformed refresh token rejected without database access', async () => {
    await expect(auth.refresh('not-a-token')).rejects.toThrow();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

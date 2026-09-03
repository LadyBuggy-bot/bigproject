import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { AuthUser } from './types/auth-user.type';
import { TwoFactorService } from './two-factor.service';

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}
export interface AccessClaims {
  sub: string;
  sid: string;
  exp: number;
  kind: 'access';
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async login(email: string, password: string, metadata: RequestMetadata = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (
      !(await this.passwords.verify(password, user?.passwordHash)) ||
      !user ||
      user.status !== 'ACTIVE' ||
      user.deletedAt
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const secret = randomBytes(32).toString('hex');
    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize session creation with user blocking/role changes.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (
        current.status !== 'ACTIVE' ||
        current.deletedAt ||
        current.passwordHash !== user.passwordHash
      )
        throw new UnauthorizedException();
      if (current.totpSecretEncrypted) return this.twoFactor.challenge(tx, current);
      const created = await tx.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: hashToken(secret),
          expiresAt: new Date(Date.now() + 30 * 86400_000),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'auth.login',
          entityType: 'SESSION',
          entityId: created.id,
          ...metadata,
        },
        tx,
      );
      return created;
    });
    if ('requiresTwoFactor' in result) return result;
    return this.tokens(user.id, result.id, secret);
  }

  async verifyTwoFactor(token: string, code: string, metadata: RequestMetadata = {}) {
    const secret = randomBytes(32).toString('hex');
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await this.twoFactor.consumeChallenge(tx, token, code);
      if (!user) return null;
      const session = await tx.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: hashToken(secret),
          expiresAt: new Date(Date.now() + 30 * 86400_000),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'auth.login.2fa',
          entityType: 'SESSION',
          entityId: session.id,
          ...metadata,
        },
        tx,
      );
      return session;
    });
    if (!result) throw new UnauthorizedException('Invalid or expired verification');
    return this.tokens(result.userId, result.id, secret);
  }

  async refresh(token: string, metadata: RequestMetadata = {}) {
    const parts = token.split('.');
    if (parts.length !== 2 || !uuidPattern.test(parts[0]) || !/^[0-9a-f]{64}$/.test(parts[1]))
      throw new UnauthorizedException();
    const [sessionId, secret] = parts;
    const replacement = randomBytes(32).toString('hex');
    const session = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.session.findUnique({ where: { id: sessionId } });
      if (!existing) throw new UnauthorizedException();
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${existing.userId}::uuid FOR UPDATE`;
      const changed = await tx.session.updateMany({
        where: {
          id: sessionId,
          refreshTokenHash: hashToken(secret),
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: 'ACTIVE', deletedAt: null },
        },
        data: { refreshTokenHash: hashToken(replacement) },
      });
      if (changed.count !== 1) throw new UnauthorizedException();
      await this.audit.log(
        {
          userId: existing.userId,
          action: 'auth.refresh',
          entityType: 'SESSION',
          entityId: sessionId,
          ...metadata,
        },
        tx,
      );
      return existing;
    });
    return this.tokens(session.userId, sessionId, replacement);
  }

  private async tokens(userId: string, sessionId: string, secret: string) {
    return {
      accessToken: await this.jwt.signAsync({ sub: userId, sid: sessionId, kind: 'access' }),
      refreshToken: `${sessionId}.${secret}`,
      tokenType: 'Bearer',
      expiresIn: 900,
    };
  }

  async authenticate(token: string): Promise<{ user: AuthUser; claims: AccessClaims }> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
      if (
        claims.kind !== 'access' ||
        !uuidPattern.test(claims.sub) ||
        !uuidPattern.test(claims.sid) ||
        !Number.isFinite(claims.exp) ||
        claims.exp * 1000 <= Date.now()
      )
        throw new Error('Invalid claims');
    } catch {
      throw new UnauthorizedException();
    }
    const session = await this.prisma.session.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE', deletedAt: null },
      },
      include: {
        user: {
          include: {
            roles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
    });
    if (!session) throw new UnauthorizedException();
    return {
      claims,
      user: {
        id: session.userId,
        roles: session.user.roles.map(({ role }) => role.name),
        permissions: [
          ...new Set(
            session.user.roles.flatMap(({ role }) =>
              role.permissions.map(({ permission }) => permission.code),
            ),
          ),
        ],
      },
    };
  }

  async logout(userId: string, sessionId: string | undefined, metadata: RequestMetadata = {}) {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      await tx.session.updateMany({
        where: { userId, ...(sessionId ? { id: sessionId } : {}), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          userId,
          action: sessionId ? 'auth.logout' : 'auth.logout_all',
          entityType: 'USER',
          entityId: userId,
          ...metadata,
        },
        tx,
      );
    });
    return { success: true };
  }
}

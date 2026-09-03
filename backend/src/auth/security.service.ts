import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from './types/auth-user.type';
import type { RequestMetadata } from './auth.service';

@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}
  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecretEncrypted: true, recoveryCodeHashes: true },
    });
    return {
      enabled: !!user.totpSecretEncrypted,
      remainingRecoveryCodes: user.recoveryCodeHashes.length,
    };
  }
  async sessions(userId: string, currentId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceName: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return sessions.map((session) => ({ ...session, current: session.id === currentId }));
  }
  async sessionsFor(actor: AuthUser, userId: string) {
    if (!actor.permissions.includes('user.manage_sessions')) throw new ForbiddenException();
    return this.sessions(userId, '');
  }
  async resetPassword(
    actor: AuthUser,
    userId: string,
    password: string,
    metadata: RequestMetadata,
  ) {
    if (actor.id === userId)
      throw new BadRequestException('Use the personal password-change endpoint');
    if (
      !actor.permissions.includes('user.update') ||
      !actor.permissions.includes('user.manage_sessions')
    )
      throw new ForbiddenException();
    const hash = await this.passwords.hash(password);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hash, securityVersion: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'auth.password.reset',
          entityType: 'USER',
          entityId: userId,
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }
  async revoke(actor: AuthUser, id: string, metadata: RequestMetadata) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { id } });
      if (
        !session ||
        (session.userId !== actor.id && !actor.permissions.includes('user.manage_sessions'))
      )
        throw new NotFoundException();
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.userId}::uuid FOR UPDATE`;
      await tx.session.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'session.revoke',
          entityType: 'SESSION',
          entityId: id,
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }
  async changePassword(
    userId: string,
    currentPassword: string,
    password: string,
    metadata: RequestMetadata,
  ) {
    const hash = await this.passwords.hash(password);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        user.status !== 'ACTIVE' ||
        !(await this.passwords.verify(currentPassword, user.passwordHash))
      )
        throw new UnauthorizedException();
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hash, securityVersion: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          userId,
          action: 'auth.password.change',
          entityType: 'USER',
          entityId: userId,
          ...metadata,
        },
        tx,
      );
      return { success: true, requiresLogin: true };
    });
  }
}

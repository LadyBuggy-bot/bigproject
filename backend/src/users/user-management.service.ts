import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { AuthUser } from '../auth/types/auth-user.type';
import { RequestMetadata } from '../auth/auth.service';

export const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  departmentId: true,
  managerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UserManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {}

  async create(
    actor: AuthUser,
    input: { email: string; firstName: string; lastName: string; password: string },
    metadata: RequestMetadata,
  ) {
    if (!actor.permissions.includes('user.create')) throw new ForbiddenException();
    const passwordHash = await this.passwords.hash(input.password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email.trim().toLowerCase(),
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
        },
        select: publicUserSelect,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'user.create',
          entityType: 'USER',
          entityId: user.id,
          newValue: { email: user.email },
          ...metadata,
        },
        tx,
      );
      return user;
    });
  }

  async changeStatus(
    actor: AuthUser,
    userId: string,
    status: UserStatus,
    metadata: RequestMetadata,
    successorId?: string,
  ) {
    if (!actor.permissions.includes(status === 'DISMISSED' ? 'user.dismiss' : 'user.block'))
      throw new ForbiddenException();
    if (actor.id === userId) throw new BadRequestException('Cannot disable yourself');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
        const old = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (status === 'DISMISSED') {
          const [clients, deals, tasks, reports] = await Promise.all([
            tx.client.count({ where: { responsibleUserId: userId, deletedAt: null } }),
            tx.deal.count({ where: { responsibleUserId: userId, deletedAt: null } }),
            tx.task.count({
              where: { assigneeId: userId, deletedAt: null, taskStatus: { isTerminal: false } },
            }),
            tx.user.count({ where: { managerId: userId, deletedAt: null } }),
          ]);
          if ((clients || deals || tasks || reports) && !successorId)
            throw new ConflictException('An active successor is required before dismissal');
          if (successorId) {
            if (successorId === userId) throw new BadRequestException('Invalid successor');
            const successor = await tx.user.findFirst({
              where: { id: successorId, status: 'ACTIVE', deletedAt: null },
            });
            if (!successor) throw new BadRequestException('Successor must be active');
            let cursor: string | null = successorId;
            const seen = new Set<string>();
            while (cursor) {
              if (cursor === userId || seen.has(cursor))
                throw new BadRequestException('Successor must be outside the subordinate tree');
              seen.add(cursor);
              cursor = (await tx.user.findUniqueOrThrow({ where: { id: cursor } })).managerId;
            }
            await tx.client.updateMany({
              where: { responsibleUserId: userId, deletedAt: null },
              data: { responsibleUserId: successorId },
            });
            await tx.deal.updateMany({
              where: { responsibleUserId: userId, deletedAt: null },
              data: { responsibleUserId: successorId },
            });
            await tx.task.updateMany({
              where: { assigneeId: userId, deletedAt: null, taskStatus: { isTerminal: false } },
              data: { assigneeId: successorId },
            });
            await tx.user.updateMany({
              where: { managerId: userId, deletedAt: null },
              data: { managerId: successorId },
            });
            await tx.department.updateMany({
              where: { managerId: userId },
              data: { managerId: successorId },
            });
            await this.audit.log(
              {
                userId: actor.id,
                action: 'user.responsibilities.transfer',
                entityType: 'USER',
                entityId: userId,
                newValue: { successorId, clients, deals, tasks, reports },
                ...metadata,
              },
              tx,
            );
          }
        }
        const user = await tx.user.update({
          where: { id: userId },
          data: { status, ...(status !== 'ACTIVE' ? { securityVersion: { increment: 1 } } : {}) },
          select: publicUserSelect,
        });
        if (status !== 'ACTIVE')
          await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        await this.audit.log(
          {
            userId: actor.id,
            action: 'user.status',
            entityType: 'USER',
            entityId: userId,
            oldValue: { status: old.status },
            newValue: { status },
            ...metadata,
          },
          tx,
        );
        return user;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateProfile(
    actor: AuthUser,
    userId: string,
    input: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      departmentId?: string | null;
    },
    metadata: RequestMetadata,
  ) {
    if (!actor.permissions.includes('user.update')) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      if (input.departmentId)
        await tx.department.findUniqueOrThrow({ where: { id: input.departmentId } });
      const old = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: publicUserSelect,
      });
      const user = await tx.user.update({
        where: { id: userId },
        data: input,
        select: publicUserSelect,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'user.update',
          entityType: 'USER',
          entityId: userId,
          oldValue: {
            firstName: old.firstName,
            lastName: old.lastName,
            phone: old.phone,
            departmentId: old.departmentId,
          },
          newValue: input,
          ...metadata,
        },
        tx,
      );
      return user;
    });
  }

  async changeManager(
    actor: AuthUser,
    userId: string,
    managerId: string | null,
    metadata: RequestMetadata,
  ) {
    if (!actor.permissions.includes('user.update')) throw new ForbiddenException();
    // SERIALIZABLE prevents two simultaneous A->B / B->A changes forming a cycle.
    return this.prisma.$transaction(
      async (tx) => {
        const old = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const seen = new Set([userId]);
        let cursor = managerId;
        while (cursor) {
          if (seen.has(cursor)) throw new BadRequestException('Manager hierarchy cycle');
          seen.add(cursor);
          const manager = await tx.user.findUnique({ where: { id: cursor } });
          if (
            !manager ||
            manager.deletedAt ||
            (cursor === managerId && manager.status !== 'ACTIVE')
          )
            throw new BadRequestException('Invalid manager');
          cursor = manager.managerId;
        }
        const user = await tx.user.update({
          where: { id: userId },
          data: { managerId },
          select: publicUserSelect,
        });
        await this.audit.log(
          {
            userId: actor.id,
            action: 'user.manager',
            entityType: 'USER',
            entityId: userId,
            oldValue: { managerId: old.managerId },
            newValue: { managerId },
            ...metadata,
          },
          tx,
        );
        return user;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

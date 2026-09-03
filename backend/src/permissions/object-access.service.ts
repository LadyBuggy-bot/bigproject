import { Injectable, NotFoundException } from '@nestjs/common';
import { ObjectType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService, AccessObject } from './permission.service';
import { AuthUser } from '../auth/types/auth-user.type';

@Injectable()
export class ObjectAccessService {
  private readonly resolvers = new Map<ObjectType, (id: string) => Promise<AccessObject | null>>();
  private readonly policies = new Map<
    ObjectType,
    (user: AuthUser, id: string, action: string) => Promise<boolean>
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}
  // Stage 3/5 modules register resolvers when their schema exists. Missing domains fail closed.
  register(type: ObjectType, resolver: (id: string) => Promise<AccessObject | null>) {
    this.resolvers.set(type, resolver);
  }
  registerPolicy(
    type: ObjectType,
    policy: (user: AuthUser, id: string, action: string) => Promise<boolean>,
  ) {
    this.policies.set(type, policy);
  }
  async load(type: ObjectType, id: string): Promise<AccessObject | null> {
    const custom = this.resolvers.get(type);
    if (custom) return custom(id);
    if (type === 'CLIENT' || type === 'DEAL') {
      const object =
        type === 'CLIENT'
          ? await this.prisma.client.findFirst({
              where: { id, deletedAt: null },
              select: { id: true, responsibleUserId: true },
            })
          : await this.prisma.deal.findFirst({
              where: { id, deletedAt: null },
              select: { id: true, responsibleUserId: true },
            });
      return object ? { ...object, type } : null;
    }
    if (type === 'TASK') {
      const task = await this.prisma.task.findFirst({
        where: { id, deletedAt: null },
        include: { participants: { select: { userId: true } } },
      });
      return task
        ? {
            id,
            type,
            authorId: task.authorId,
            assigneeId: task.assigneeId,
            participantUserIds: task.participants.map((p) => p.userId),
          }
        : null;
    }
    return null;
  }
  async canAccess(user: AuthUser, type: ObjectType, id: string, action = 'read'): Promise<boolean> {
    const policy = this.policies.get(type);
    if (policy) return policy(user, id, action);
    const object = await this.load(type, id);
    return (
      !!object && this.permissions.canAccessObject(user, `${type.toLowerCase()}.${action}`, object)
    );
  }
  async assert(user: AuthUser, type: ObjectType, id: string, action = 'read') {
    if (!(await this.canAccess(user, type, id, action)))
      throw new NotFoundException('Object not found');
  }
}

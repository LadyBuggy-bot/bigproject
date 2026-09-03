import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, ObjectType, PermissionEffect } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/types/auth-user.type';
import type { RequestMetadata } from '../auth/auth.service';
import { SYSTEM_ROLES } from './roles.service';
import { ObjectAccessService } from '../permissions/object-access.service';

@Injectable()
export class RoleManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly objects: ObjectAccessService,
  ) {}
  async update(
    actor: AuthUser,
    id: string,
    input: { name?: string; description?: string; permissions?: string[] },
    metadata: RequestMetadata,
  ) {
    if (
      !actor.permissions.includes('role.update') ||
      (input.permissions && !actor.permissions.includes('permission.manage'))
    )
      throw new ForbiddenException();
    return this.prisma.$transaction(
      async (tx) => {
        const old = await tx.role.findUniqueOrThrow({
          where: { id },
          include: { permissions: { include: { permission: true } } },
        });
        if (actor.roles.includes(old.name))
          throw new BadRequestException('Cannot edit a role assigned to yourself');
        if (old.permissions.some((p) => !actor.permissions.includes(p.permission.code)))
          throw new ForbiddenException();
        if (
          input.name !== undefined &&
          (old.isSystem ||
            !input.name.trim() ||
            SYSTEM_ROLES.includes(input.name.trim().toUpperCase()))
        )
          throw new BadRequestException('Reserved system role name');
        if (input.permissions?.some((code) => !actor.permissions.includes(code)))
          throw new ForbiddenException();
        const codes = input.permissions ? [...new Set(input.permissions)] : null;
        if (codes) {
          const permissions = await tx.permission.findMany({ where: { code: { in: codes } } });
          if (permissions.length !== codes.length)
            throw new BadRequestException('Unknown permission');
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
          });
        }
        const role = await tx.role.update({
          where: { id },
          data: { name: input.name?.trim(), description: input.description },
        });
        await this.audit.log(
          {
            userId: actor.id,
            action: 'role.update',
            entityType: 'ROLE',
            entityId: id,
            oldValue: {
              name: old.name,
              permissions: old.permissions.map((p) => p.permission.code),
            },
            newValue: {
              name: role.name,
              permissions: codes ?? old.permissions.map((p) => p.permission.code),
            },
            ...metadata,
          },
          tx,
        );
        return role;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async remove(actor: AuthUser, id: string, metadata: RequestMetadata) {
    if (!actor.permissions.includes('role.delete')) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({ where: { id } });
      if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
      if (await tx.userRole.count({ where: { roleId: id } }))
        throw new ConflictException('Role is still assigned');
      await tx.role.delete({ where: { id } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'role.delete',
          entityType: 'ROLE',
          entityId: id,
          oldValue: { name: role.name },
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }
  async setAcl(
    actor: AuthUser,
    input: {
      userId: string;
      objectType: ObjectType;
      objectId: string;
      permission: string;
      effect: PermissionEffect;
    },
    metadata: RequestMetadata,
  ) {
    if (
      !actor.permissions.includes('permission.manage') ||
      !actor.permissions.includes(input.permission)
    )
      throw new ForbiddenException();
    const prefix = `${input.objectType.toLowerCase()}.`;
    if (!input.permission.startsWith(prefix) || input.permission.slice(prefix.length).includes('.'))
      throw new BadRequestException('ACL requires a matching object action');
    await this.objects.assert(
      actor,
      input.objectType,
      input.objectId,
      input.permission.slice(prefix.length),
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      await tx.permission.findUniqueOrThrow({ where: { code: input.permission } });
      const key = {
        userId: input.userId,
        objectType: input.objectType,
        objectId: input.objectId,
        permission: input.permission,
      };
      const old = await tx.objectPermission.findUnique({
        where: { userId_objectType_objectId_permission: key },
      });
      const acl = await tx.objectPermission.upsert({
        where: { userId_objectType_objectId_permission: key },
        create: input,
        update: { effect: input.effect },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'permission.acl.set',
          entityType: 'ACL',
          entityId: acl.id,
          oldValue: old ? { effect: old.effect } : {},
          newValue: input,
          ...metadata,
        },
        tx,
      );
      return acl;
    });
  }
  async removeAcl(actor: AuthUser, id: string, metadata: RequestMetadata) {
    if (
      !actor.permissions.includes('permission.manage') ||
      !actor.roles.some((r) => ['OWNER', 'ADMIN'].includes(r))
    )
      throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.objectPermission.delete({ where: { id } });
      if (!actor.permissions.includes(old.permission)) throw new ForbiddenException();
      await this.audit.log(
        {
          userId: actor.id,
          action: 'permission.acl.delete',
          entityType: 'ACL',
          entityId: id,
          oldValue: {
            userId: old.userId,
            objectType: old.objectType,
            objectId: old.objectId,
            permission: old.permission,
            effect: old.effect,
          },
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }
}

import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/types/auth-user.type';
import { RequestMetadata } from '../auth/auth.service';

export const SYSTEM_ROLES = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'EMPLOYEE',
  'SALES_MANAGER',
  'OBSERVER',
  'GUEST',
];

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, name: string, codes: string[], metadata: RequestMetadata) {
    if (
      !actor.permissions.includes('role.create') ||
      !actor.permissions.includes('permission.manage')
    )
      throw new ForbiddenException();
    const normalized = name.trim();
    if (!normalized || SYSTEM_ROLES.includes(normalized.toUpperCase()))
      throw new BadRequestException('Reserved role name');
    if (codes.some((code) => !actor.permissions.includes(code)))
      throw new ForbiddenException('Cannot grant permissions you do not have');
    return this.prisma.$transaction(async (tx) => {
      const permissions = await tx.permission.findMany({
        where: { code: { in: [...new Set(codes)] } },
      });
      if (permissions.length !== new Set(codes).size)
        throw new BadRequestException('Unknown permission');
      const role = await tx.role.create({
        data: {
          name: normalized,
          permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'role.create',
          entityType: 'ROLE',
          entityId: role.id,
          newValue: { name: normalized, permissions: codes },
          ...metadata,
        },
        tx,
      );
      return role;
    });
  }

  async assign(actor: AuthUser, userId: string, roleIds: string[], metadata: RequestMetadata) {
    if (
      !actor.permissions.includes('user.manage_roles') ||
      !actor.permissions.includes('role.assign')
    )
      throw new ForbiddenException();
    // Changing system scopes (e.g. MANAGER -> ALL) requires a system administrator.
    if (!actor.roles.some((role) => ['OWNER', 'ADMIN'].includes(role)))
      throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const roles = await tx.role.findMany({
        where: { id: { in: [...new Set(roleIds)] } },
        include: { permissions: { include: { permission: true } } },
      });
      if (roles.length !== new Set(roleIds).size) throw new BadRequestException('Unknown role');
      if (
        roles.some((role) =>
          role.permissions.some(({ permission }) => !actor.permissions.includes(permission.code)),
        )
      )
        throw new ForbiddenException();
      // Avoid removing the only administrator through this first-stage endpoint.
      if (userId === actor.id) throw new BadRequestException('Self role changes are disabled');
      const old = await tx.userRole.findMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: roles.map(({ id }) => ({ userId, roleId: id })) });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'user.manage_roles',
          entityType: 'USER',
          entityId: userId,
          oldValue: old.map(({ roleId }) => roleId),
          newValue: roles.map(({ id }) => id),
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }
}

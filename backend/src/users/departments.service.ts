import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/types/auth-user.type';
import type { RequestMetadata } from '../auth/auth.service';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async save(
    actor: AuthUser,
    id: string | undefined,
    data: { name: string; parentId?: string | null; managerId?: string | null },
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const old = id ? await tx.department.findUniqueOrThrow({ where: { id } }) : null;
        let cursor = data.parentId;
        const seen = new Set(id ? [id] : []);
        while (cursor) {
          if (seen.has(cursor)) throw new BadRequestException('Department hierarchy cycle');
          seen.add(cursor);
          cursor = (await tx.department.findUniqueOrThrow({ where: { id: cursor } })).parentId;
        }
        if (
          data.managerId &&
          !(await tx.user.findFirst({
            where: { id: data.managerId, status: 'ACTIVE', deletedAt: null },
          }))
        )
          throw new BadRequestException('Invalid manager');
        const values = { ...data, name: data.name.trim() };
        if (!values.name) throw new BadRequestException('Name is required');
        const department = id
          ? await tx.department.update({ where: { id }, data: values })
          : await tx.department.create({ data: values });
        await this.audit.log(
          {
            userId: actor.id,
            action: id ? 'department.update' : 'department.create',
            entityType: 'DEPARTMENT',
            entityId: department.id,
            oldValue: old
              ? { name: old.name, parentId: old.parentId, managerId: old.managerId }
              : {},
            newValue: values,
            ...metadata,
          },
          tx,
        );
        return department;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async remove(actor: AuthUser, id: string, metadata: RequestMetadata) {
    return this.prisma.$transaction(async (tx) => {
      if (
        (await tx.user.count({ where: { departmentId: id } })) ||
        (await tx.department.count({ where: { parentId: id } }))
      )
        throw new ConflictException('Department is not empty');
      await tx.department.delete({ where: { id } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'department.delete',
          entityType: 'DEPARTMENT',
          entityId: id,
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }
}

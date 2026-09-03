import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SECRET_FIELDS } from '../permissions/permission.service';

function redact(value: Prisma.InputJsonValue): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map((item) => (item === null ? null : redact(item)));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_FIELDS.has(key))
        .map(([key, item]) => [key, item == null ? null : redact(item)]),
    );
  }
  return value;
}

export interface AuditEntry {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  requestId?: string;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: AuditEntry, transaction: Prisma.TransactionClient = this.prisma) {
    return transaction.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        requestId: entry.requestId,
        ipAddress: entry.ipAddress,
        oldValue: entry.oldValue === undefined ? undefined : redact(entry.oldValue),
        newValue: entry.newValue === undefined ? undefined : redact(entry.newValue),
      },
    });
  }
}

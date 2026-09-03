import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Notification, NotificationChannel, ObjectType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/types/auth-user.type';
import { ObjectAccessService } from '../permissions/object-access.service';

export interface NotificationInput {
  userId: string;
  eventKey: string;
  type: string;
  title: string;
  message: string;
  entityType?: ObjectType;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: ObjectAccessService,
  ) {}
  async context(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      roles: user.roles.map((r) => r.role.name),
      permissions: [
        ...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
      ],
    };
  }
  async visible(user: AuthUser, notification: Notification) {
    return (
      notification.userId === user.id &&
      (!notification.entityType ||
        (!!notification.entityId &&
          (await this.objects.canAccess(user, notification.entityType, notification.entityId))))
    );
  }
  // A stable eventKey and nested delivery rows provide an idempotent transactional outbox.
  // Call with the business transaction when creating a task/deal event.
  async create(input: NotificationInput, tx: Prisma.TransactionClient = this.prisma) {
    if (!!input.entityType !== !!input.entityId)
      throw new BadRequestException('Both entity fields required');
    if (
      !input.eventKey ||
      input.eventKey.length > 200 ||
      input.title.length > 200 ||
      input.message.length > 4000
    )
      throw new BadRequestException('Invalid notification');
    const user = await tx.user.findFirst({
      where: { id: input.userId, status: 'ACTIVE', deletedAt: null },
    });
    if (!user) return null;
    const preferences = await tx.notificationPreference.findMany({
      where: { userId: input.userId, enabled: true },
    });
    const channels = [
      ...new Set<NotificationChannel>(['IN_APP', ...preferences.map((p) => p.channel)]),
    ];
    return tx.notification.upsert({
      where: { userId_eventKey: { userId: input.userId, eventKey: input.eventKey } },
      update: {},
      create: {
        ...input,
        // Related-object descriptions can embed fields the reader cannot see; never store them in the inbox.
        ...(input.entityType
          ? {
              title: 'Обновление в системе',
              message: 'Откройте объект, чтобы посмотреть изменения.',
            }
          : {}),
        deliveries: { create: channels.map((channel) => ({ channel })) },
      },
    });
  }
  async list(user: AuthUser, limit: number, cursor?: string, unreadOnly = false) {
    const visible: Notification[] = [];
    let position = cursor;
    while (visible.length <= limit) {
      const batch = await this.prisma.notification.findMany({
        where: {
          userId: user.id,
          ...(unreadOnly ? { isRead: false } : {}),
          ...(position ? { id: { lt: position } } : {}),
        },
        orderBy: { id: 'desc' },
        take: 100,
      });
      if (!batch.length) break;
      for (const item of batch) {
        if (await this.visible(user, item)) visible.push(item);
        if (visible.length > limit) break;
      }
      position = batch[batch.length - 1].id;
      if (batch.length < 100) break;
    }
    return {
      items: visible.slice(0, limit),
      nextCursor: visible.length > limit ? visible[limit - 1].id : null,
    };
  }
  async read(user: AuthUser, id: string) {
    const item = await this.prisma.notification.findFirst({ where: { id, userId: user.id } });
    if (!item || !(await this.visible(user, item))) throw new NotFoundException();
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: item.readAt ?? new Date() },
    });
  }
  async readAll(user: AuthUser) {
    // Ownership-scoped update changes no business-object data and exposes no hidden counts.
    await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }
  async preferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      select: { channel: true, enabled: true },
    });
  }
  async setPreference(userId: string, channel: NotificationChannel, enabled: boolean) {
    if (channel === 'IN_APP' && !enabled)
      throw new BadRequestException('The in-app inbox is always available');
    return this.prisma.notificationPreference.upsert({
      where: { userId_channel: { userId, channel } },
      create: { userId, channel, enabled },
      update: { enabled },
      select: { channel: true, enabled: true },
    });
  }
}

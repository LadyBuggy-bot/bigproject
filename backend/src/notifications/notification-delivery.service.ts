import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import {
  ChannelNotConfigured,
  NotificationTransportService,
} from './notification-transport.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class NotificationDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly transport: NotificationTransportService,
    private readonly events: EventsGateway,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (this.config.get('NOTIFICATION_DELIVERY_ENABLED', 'false') !== 'true') return;
    this.timer = setInterval(() => {
      if (!this.running)
        this.running = this.tick()
          .catch(() => this.logger.error('Notification outbox processing failed'))
          .finally(() => {
            this.running = undefined;
          });
    }, 5000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  async tick() {
    const stale = new Date(Date.now() - 60000);
    const due = await this.prisma.notificationDelivery.findMany({
      where: {
        attempts: { lt: 5 },
        OR: [
          { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
          { status: 'PROCESSING', leasedAt: { lt: stale } },
        ],
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: 10,
    });
    for (const item of due) {
      const leasedAt = new Date();
      const claim = await this.prisma.notificationDelivery.updateMany({
        where: {
          id: item.id,
          attempts: item.attempts,
          status: item.status,
          leasedAt: item.leasedAt,
        },
        data: { status: 'PROCESSING', leasedAt, attempts: { increment: 1 } },
      });
      if (claim.count !== 1) continue;
      try {
        const notification = await this.prisma.notification.findUniqueOrThrow({
          where: { id: item.notificationId },
        });
        const user = await this.notifications.context(notification.userId);
        if (!user || !(await this.notifications.visible(user, notification))) {
          await this.finish(item.id, leasedAt, 'SKIPPED', 'Access revoked');
          continue;
        }
        if (item.channel === 'IN_APP') {
          await this.events.emitToUsers([user.id], 'notification.created', {
            entityType: 'NOTIFICATION',
            entityId: notification.id,
            action: 'created',
          });
        } else {
          const preference = await this.prisma.notificationPreference.findUnique({
            where: { userId_channel: { userId: user.id, channel: item.channel } },
          });
          if (!preference?.enabled) {
            await this.finish(item.id, leasedAt, 'SKIPPED', 'Channel disabled');
            continue;
          }
          const profile = await this.prisma.user.findUniqueOrThrow({
            where: { id: user.id },
            select: { email: true },
          });
          const destination = item.channel === 'EMAIL' ? profile.email : preference.destination;
          if (!destination) throw new ChannelNotConfigured('No destination');
          await this.transport.send(item.channel, destination, notification.id);
        }
        await this.finish(item.id, leasedAt, 'SENT');
      } catch (error) {
        const failed = error instanceof ChannelNotConfigured || item.attempts + 1 >= 5;
        await this.prisma.notificationDelivery.updateMany({
          where: { id: item.id, status: 'PROCESSING', leasedAt },
          data: {
            status: failed ? 'FAILED' : 'PENDING',
            leasedAt: null,
            nextAttemptAt: new Date(Date.now() + 1000 * 2 ** (item.attempts + 1)),
            error:
              error instanceof ChannelNotConfigured ? 'Channel not configured' : 'Delivery failed',
          },
        });
      }
    }
    // A process may crash after claiming its last attempt.
    await this.prisma.notificationDelivery.updateMany({
      where: { status: 'PROCESSING', attempts: { gte: 5 }, leasedAt: { lt: stale } },
      data: { status: 'FAILED', leasedAt: null, error: 'Delivery lease expired' },
    });
  }
  private async finish(id: string, leasedAt: Date, status: 'SENT' | 'SKIPPED', error?: string) {
    await this.prisma.notificationDelivery.updateMany({
      where: { id, status: 'PROCESSING', leasedAt },
      data: {
        status,
        error: error ?? null,
        leasedAt: null,
        ...(status === 'SENT' ? { sentAt: new Date() } : {}),
      },
    });
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsService } from './notifications.service';
import { NotificationTransportService } from './notification-transport.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsController, NotificationAdminController } from './notifications.controller';
@Module({
  imports: [PrismaModule, PermissionsModule, EventsModule, AuditModule],
  providers: [NotificationsService, NotificationTransportService, NotificationDeliveryService],
  controllers: [NotificationsController, NotificationAdminController],
  exports: [NotificationsService],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { QueuesModule } from './queues/queues.module';
import { RolesModule } from './roles/roles.module';
import { UserManagementModule } from './users/user-management.module';
import { FilesModule } from './files/files.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditApiModule } from './audit/audit-api.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

/**
 * ARCHITECTURE.md п. 2: modular monolith.
 * Модули домена подключаются сюда по мере готовности.
 *
 * Core dependencies for CRM are wired below.
 * Remaining Stage 1 scope: files, notifications, TOTP and full administration.
 * See docs/STAGE_1_CORE_HANDOFF.md before integrating domain modules.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env'],
    }),
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    PermissionsModule,
    AuditModule,
    UsersModule,
    EventsModule,
    QueuesModule,
    RolesModule,
    UserManagementModule,
    FilesModule,
    NotificationsModule,
    AuditApiModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}

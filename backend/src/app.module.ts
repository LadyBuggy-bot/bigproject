import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';

/**
 * ARCHITECTURE.md п. 2: modular monolith.
 * Модули домена подключаются сюда по мере готовности.
 *
 * Ожидают ядра (stage-1-core): auth, users, roles, permissions, sessions,
 * audit, notifications, files, events.
 * Затем — tasks, projects, crm, messenger, automation, reports, ai.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env'],
    }),
    PrismaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

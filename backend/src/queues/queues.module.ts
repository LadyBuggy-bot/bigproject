import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

export const CRM_QUEUE = 'crm';
export function parseQueueConnection(value: string) {
  const url = new URL(value);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('VALKEY_URL must use redis:// or rediss://');
  const db = Number(url.pathname.slice(1) || '0');
  if (!Number.isInteger(db) || db < 0) throw new Error('Invalid Valkey database');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: 1,
  };
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseQueueConnection(config.getOrThrow<string>('VALKEY_URL')),
      }),
    }),
    BullModule.registerQueue({
      name: CRM_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}

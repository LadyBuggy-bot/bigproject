import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Единственная точка доступа к PostgreSQL.
 * ARCHITECTURE.md п. 5: клиенты не имеют прямого доступа к базе,
 * всё идёт через backend.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL подключён');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

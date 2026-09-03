import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditController } from './audit.controller';
import { AuditModule } from './audit.module';
@Module({ imports: [PrismaModule, PermissionsModule, AuditModule], controllers: [AuditController] })
export class AuditApiModule {}

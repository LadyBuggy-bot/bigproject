import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RoleManagementService } from './role-management.service';
import { RoleManagementController } from './role-management.controller';
@Module({
  imports: [PrismaModule, AuditModule, PermissionsModule],
  controllers: [RolesController, RoleManagementController],
  providers: [RolesService, RoleManagementService],
  exports: [RolesService],
})
export class RolesModule {}

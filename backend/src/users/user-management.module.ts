import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UserManagementController } from './user-management.controller';
import { UserManagementService } from './user-management.service';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
@Module({
  imports: [AuthModule, AuditModule, PrismaModule, PermissionsModule],
  controllers: [UserManagementController, DepartmentsController],
  providers: [UserManagementService, DepartmentsService],
})
export class UserManagementModule {}

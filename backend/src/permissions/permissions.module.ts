import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { ObjectAccessService } from './object-access.service';

@Module({
  imports: [PrismaModule, UsersModule],
  providers: [PermissionService, PermissionsGuard, ObjectAccessService],
  exports: [PermissionService, PermissionsGuard, ObjectAccessService],
})
export class PermissionsModule {}

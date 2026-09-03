import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';
import { FilesController, FileFoldersController } from './files.controller';
@Module({
  imports: [PrismaModule, PermissionsModule, AuditModule],
  providers: [FilesService, StorageService],
  controllers: [FilesController, FileFoldersController],
  exports: [FilesService],
})
export class FilesModule {}

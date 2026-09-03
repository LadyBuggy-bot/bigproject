import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  ValidateIf,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ObjectType, PermissionEffect } from '@prisma/client';
import { RoleManagementService } from './role-management.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { AuthRequest } from '../auth/guards/jwt-auth.guard';
import { requestMetadata } from '../auth/auth.controller';

class UpdateRoleDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(300)
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];
}
class AclDto {
  @IsUUID() userId!: string;
  @IsEnum(ObjectType) objectType!: ObjectType;
  @IsUUID() objectId!: string;
  @IsString() @MaxLength(100) permission!: string;
  @IsEnum(PermissionEffect) effect!: PermissionEffect;
}
class AclQuery {
  @IsUUID() userId!: string;
}

@Controller()
@UseGuards(PermissionsGuard)
export class RoleManagementController {
  constructor(
    private readonly service: RoleManagementService,
    private readonly prisma: PrismaService,
  ) {}
  @Patch('roles/:id') @RequirePermissions('role.update') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(req.user, id, dto, requestMetadata(req));
  }
  @Delete('roles/:id') @RequirePermissions('role.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.remove(req.user, id, requestMetadata(req));
  }
  @Get('permissions/acl') @RequirePermissions('permission.manage') list(@Query() query: AclQuery) {
    return this.prisma.objectPermission.findMany({
      where: { userId: query.userId },
      take: 500,
      orderBy: { id: 'asc' },
    });
  }
  @Post('permissions/acl') @RequirePermissions('permission.manage') set(
    @Body() dto: AclDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.setAcl(req.user, dto, requestMetadata(req));
  }
  @Delete('permissions/acl/:id') @RequirePermissions('permission.manage') removeAcl(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.removeAcl(req.user, id, requestMetadata(req));
  }
}

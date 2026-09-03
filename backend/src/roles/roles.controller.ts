import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { AuthRequest } from '../auth/guards/jwt-auth.guard';
import { requestMetadata } from '../auth/auth.controller';
import { RolesService } from './roles.service';

class CreateRoleDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsArray() @ArrayMaxSize(300) @ArrayUnique() @IsString({ each: true }) permissions!: string[];
}
class AssignRolesDto {
  @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsUUID('all', { each: true }) roleIds!: string[];
}

@Controller()
@UseGuards(PermissionsGuard)
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly prisma: PrismaService,
  ) {}
  @Get('roles')
  @RequirePermissions('role.read')
  list() {
    return this.prisma.role.findMany({
      take: 100,
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
  }
  @Get('permissions')
  @RequirePermissions('permission.read')
  permissions() {
    return this.prisma.permission.findMany({ take: 500, orderBy: { code: 'asc' } });
  }
  @Post('roles')
  @RequirePermissions('role.create', 'permission.manage')
  create(@Body() dto: CreateRoleDto, @Req() request: AuthRequest) {
    return this.roles.create(request.user, dto.name, dto.permissions, requestMetadata(request));
  }
  @Put('users/:id/roles')
  @RequirePermissions('user.manage_roles', 'role.assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
    @Req() request: AuthRequest,
  ) {
    return this.roles.assign(request.user, id, dto.roleIds, requestMetadata(request));
  }
}

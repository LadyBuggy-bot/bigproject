import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  IsOptional,
} from 'class-validator';
import { UserStatus } from '@prisma/client';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { AuthRequest } from '../auth/guards/jwt-auth.guard';
import { requestMetadata } from '../auth/auth.controller';
import { PrismaService } from '../prisma/prisma.service';
import { UserManagementService, publicUserSelect } from './user-management.service';
import { PageQuery, page } from '../common/page.dto';

class CreateUserDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @IsString() @MinLength(12) @MaxLength(1024) password!: string;
}
class StatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
  @IsOptional() @IsUUID() successorId?: string;
}
class ProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsUUID() departmentId?: string | null;
}
class ManagerDto {
  @ValidateIf((_object, value) => value !== null) @IsUUID() managerId!: string | null;
}

@Controller('users')
@UseGuards(PermissionsGuard)
export class UserManagementController {
  constructor(
    private readonly service: UserManagementService,
    private readonly prisma: PrismaService,
  ) {}
  @Get()
  @RequirePermissions('user.read')
  async list(@Query() query: PageQuery) {
    return page(
      await this.prisma.user.findMany({
        where: { deletedAt: null, ...(query.cursor ? { id: { gt: query.cursor } } : {}) },
        select: publicUserSelect,
        take: query.limit + 1,
        orderBy: { id: 'asc' },
      }),
      query.limit,
    );
  }
  @Post()
  @RequirePermissions('user.create')
  create(@Body() dto: CreateUserDto, @Req() request: AuthRequest) {
    return this.service.create(request.user, dto, requestMetadata(request));
  }
  @Patch(':id/status')
  @RequirePermissions('user.block')
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.changeStatus(
      request.user,
      id,
      dto.status,
      requestMetadata(request),
      dto.successorId,
    );
  }
  @Patch(':id/manager')
  @RequirePermissions('user.update')
  manager(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManagerDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.changeManager(
      request.user,
      id,
      dto.managerId ?? null,
      requestMetadata(request),
    );
  }
  @Patch(':id')
  @RequirePermissions('user.update')
  profile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProfileDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateProfile(req.user, id, dto, requestMetadata(req));
  }
}

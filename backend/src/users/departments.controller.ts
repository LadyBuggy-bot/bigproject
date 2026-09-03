import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentsService } from './departments.service';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { AuthRequest } from '../auth/guards/jwt-auth.guard';
import { requestMetadata } from '../auth/auth.controller';
import { PageQuery, page } from '../common/page.dto';

class DepartmentDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsUUID() managerId?: string | null;
}
@Controller('departments')
@UseGuards(PermissionsGuard)
export class DepartmentsController {
  constructor(
    private readonly service: DepartmentsService,
    private readonly prisma: PrismaService,
  ) {}
  @Get() @RequirePermissions('user.read') async list(@Query() query: PageQuery) {
    return page(
      await this.prisma.department.findMany({
        where: query.cursor ? { id: { gt: query.cursor } } : {},
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      }),
      query.limit,
    );
  }
  @Post() @RequirePermissions('user.update') create(
    @Body() dto: DepartmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.save(req.user, undefined, dto, requestMetadata(req));
  }
  @Put(':id') @RequirePermissions('user.update') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DepartmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.save(req.user, id, dto, requestMetadata(req));
  }
  @Delete(':id') @RequirePermissions('user.update') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.remove(req.user, id, requestMetadata(req));
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NotificationChannel } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRequest } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { AuditService } from '../audit/audit.service';
import { requestMetadata } from '../auth/auth.controller';

class ListDto {
  @IsOptional() @IsUUID() cursor?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
class PreferenceDto {
  @IsEnum(NotificationChannel) channel!: NotificationChannel;
  @IsBoolean() enabled!: boolean;
}
class DestinationDto extends PreferenceDto {
  @IsString() @MaxLength(4096) destination!: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: ListDto) {
    return this.notifications.list(req.user, query.limit, query.cursor);
  }
  @Get('unread') unread(@Req() req: AuthRequest, @Query() query: ListDto) {
    return this.notifications.list(req.user, query.limit, query.cursor, true);
  }
  @Get('preferences') preferences(@Req() req: AuthRequest) {
    return this.notifications.preferences(req.user.id);
  }
  @Put('preferences') preference(@Body() dto: PreferenceDto, @Req() req: AuthRequest) {
    return this.notifications.setPreference(req.user.id, dto.channel, dto.enabled);
  }
  @Post('read-all') all(@Req() req: AuthRequest) {
    return this.notifications.readAll(req.user);
  }
  @Post(':id/read') read(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.notifications.read(req.user, id);
  }
}

@Controller('notification-admin')
@UseGuards(PermissionsGuard)
export class NotificationAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  @Get('deliveries') @RequirePermissions('notification.manage') deliveries() {
    return this.prisma.notificationDelivery.findMany({
      orderBy: { nextAttemptAt: 'desc' },
      take: 100,
    });
  }
  @Post('deliveries/:id/retry') @RequirePermissions('notification.manage') async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.notificationDelivery.updateMany({
        where: { id, status: { in: ['FAILED', 'SKIPPED'] } },
        data: {
          status: 'PENDING',
          attempts: 0,
          error: null,
          leasedAt: null,
          nextAttemptAt: new Date(),
        },
      });
      await this.audit.log(
        {
          userId: req.user.id,
          action: 'notification.retry',
          entityType: 'DELIVERY',
          entityId: id,
          ...requestMetadata(req),
        },
        tx,
      );
      return { success: true };
    });
  }
  @Put('users/:id/destination') @RequirePermissions('notification.manage') async destination(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DestinationDto,
    @Req() req: AuthRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.notificationPreference.upsert({
        where: { userId_channel: { userId: id, channel: dto.channel } },
        create: { userId: id, ...dto },
        update: dto,
      });
      await this.audit.log(
        {
          userId: req.user.id,
          action: 'notification.destination',
          entityType: 'USER',
          entityId: id,
          newValue: { channel: dto.channel, enabled: dto.enabled },
          ...requestMetadata(req),
        },
        tx,
      );
      return { success: true };
    });
  }
}

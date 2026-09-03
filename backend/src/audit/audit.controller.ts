import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { PageQuery, page } from '../common/page.dto';
import { AuditService } from './audit.service';
import { AuthRequest } from '../auth/guards/jwt-auth.guard';
import { requestMetadata } from '../auth/auth.controller';

class AuditQuery extends PageQuery {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @MaxLength(100) action?: string;
  @IsOptional() @IsUUID() entityId?: string;
}
@Controller('audit')
@UseGuards(PermissionsGuard)
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private rows(query: AuditQuery) {
    return this.prisma.auditLog.findMany({
      where: {
        userId: query.userId,
        action: query.action,
        entityId: query.entityId,
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
  }
  @Get() @RequirePermissions('audit.read') async list(@Query() query: AuditQuery) {
    return page(await this.rows(query), query.limit);
  }
  @Get('export') @RequirePermissions('audit.read', 'audit.export') async export(
    @Query() query: AuditQuery,
    @Res() res: Response,
    @Req() req: AuthRequest,
  ) {
    const result = page(await this.rows(query), query.limit);
    await this.audit.log({
      userId: req.user.id,
      action: 'audit.export',
      entityType: 'AUDIT',
      newValue: { count: result.items.length },
      ...requestMetadata(req),
    });
    if (result.nextCursor) res.setHeader('X-Next-Cursor', result.nextCursor);
    res.setHeader('Content-Disposition', 'attachment; filename="audit.ndjson"');
    res
      .type('application/x-ndjson')
      .send(result.items.map((item) => JSON.stringify(item)).join('\n'));
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  ValidateIf,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ObjectType } from '@prisma/client';
import { Response } from 'express';
import { FilesService, MAX_FILE_BYTES } from './files.service';
import { AuthRequest } from '../auth/guards/jwt-auth.guard';
import { requestMetadata } from '../auth/auth.controller';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';

class ListDto {
  @IsOptional() @IsUUID() folderId?: string;
  @IsOptional() @IsEnum(ObjectType) entityType?: ObjectType;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
class UploadDto {
  @IsOptional() @IsUUID() folderId?: string;
}
class VersionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
}
class LinkDto {
  @IsEnum(ObjectType) entityType!: ObjectType;
  @IsUUID() entityId!: string;
}
class FolderDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsUUID() parentId?: string;
}
class ParentDto {
  @IsOptional() @IsUUID() parentId?: string;
}
class UpdateFileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  originalName?: string;
  @IsOptional() @IsUUID() folderId?: string | null;
}

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: ListDto) {
    return this.files.list(req.user, query);
  }
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('file.upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        folderId: { type: 'string', format: 'uuid' },
      },
    },
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDto,
    @Req() req: AuthRequest,
  ) {
    return this.files.upload(req.user, file, dto.folderId, requestMetadata(req));
  }
  @Get(':id') metadata(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.files.metadata(req.user, id);
  }
  @Get(':id/versions') versions(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.files.versions(req.user, id);
  }
  @Post(':id/versions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('file.update')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  version(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    return this.files.upload(req.user, file, undefined, requestMetadata(req), id);
  }
  @Get(':id/download') async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: VersionDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.content(req, res, id, query.version, false);
  }
  @Get(':id/preview') async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: VersionDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.content(req, res, id, query.version, true);
  }
  private async content(
    req: AuthRequest,
    res: Response,
    id: string,
    version: number | undefined,
    preview: boolean,
  ) {
    const result = await this.files.download(req.user, id, version, preview);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(result.buffer, {
      type: result.mimeType,
      disposition: `${preview ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(result.name)}`,
    });
  }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.files.remove(req.user, id, requestMetadata(req));
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFileDto,
    @Req() req: AuthRequest,
  ) {
    return this.files.update(req.user, id, dto, requestMetadata(req));
  }
  @Post(':id/links') link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkDto,
    @Req() req: AuthRequest,
  ) {
    return this.files.link(req.user, id, dto.entityType, dto.entityId, false, requestMetadata(req));
  }
  @Delete(':id/links') unlink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkDto,
    @Req() req: AuthRequest,
  ) {
    return this.files.link(req.user, id, dto.entityType, dto.entityId, true, requestMetadata(req));
  }
}

@Controller('file-folders')
export class FileFoldersController {
  constructor(private readonly files: FilesService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: ParentDto) {
    return this.files.folders(req.user, query.parentId);
  }
  @Post() create(@Req() req: AuthRequest, @Body() dto: FolderDto) {
    return this.files.createFolder(req.user, dto.name, dto.parentId, requestMetadata(req));
  }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.files.removeFolder(req.user, id, requestMetadata(req));
  }
  @Put(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FolderDto,
    @Req() req: AuthRequest,
  ) {
    return this.files.updateFolder(
      req.user,
      id,
      dto.name,
      dto.parentId ?? null,
      requestMetadata(req),
    );
  }
}

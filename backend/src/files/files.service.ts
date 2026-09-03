import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { isUtf8 } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { File, FileLink, ObjectType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import type { RequestMetadata } from '../auth/auth.service';
import { ObjectAccessService } from '../permissions/object-access.service';
import { PermissionService } from '../permissions/permission.service';
import { StorageService } from './storage.service';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export function safeName(value: string): string {
  const base = value.replace(/\\/g, '/').split('/').pop() ?? '';
  const name = [...base]
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, 200);
  if (!name || name === '.' || name === '..') throw new BadRequestException('Invalid filename');
  return name;
}
export function detectMime(buffer: Buffer, name: string): string {
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  if (/\.txt$/i.test(name) && !buffer.includes(0) && isUtf8(buffer)) return 'text/plain';
  return 'application/octet-stream';
}
type LinkedFile = File & { links: FileLink[] };
export function fileDto(file: File) {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    ownerId: file.ownerId,
    folderId: file.folderId,
    version: file.version,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: ObjectAccessService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
  ) {}
  onModuleInit() {
    this.objects.registerPolicy('FILE', async (user, id, action) => {
      const file = await this.prisma.file.findFirst({
        where: { id, deletedAt: null },
        include: { links: true },
      });
      return !!file && this.allowed(user, file, action);
    });
  }
  private require(user: AuthUser, code: string) {
    if (!user.permissions.includes(code)) throw new ForbiddenException();
  }

  async allowed(user: AuthUser, file: LinkedFile, action = 'read'): Promise<boolean> {
    if (!user.permissions.includes(`file.${action}`) || file.deletedAt) return false;
    if (action !== 'read' && !(await this.allowed(user, file, 'read'))) return false;
    const acl = await this.prisma.objectPermission.findUnique({
      where: {
        userId_objectType_objectId_permission: {
          userId: user.id,
          objectType: 'FILE',
          objectId: file.id,
          permission: `file.${action}`,
        },
      },
    });
    if (acl?.effect === 'DENY') return false;
    if (file.links.length) {
      // File ownership or ALL never bypasses a linked object's DENY.
      for (const link of file.links) {
        if (!(await this.objects.canAccess(user, link.entityType, link.entityId))) return false;
        if (
          ['update', 'delete'].includes(action) &&
          !(await this.objects.canAccess(user, link.entityType, link.entityId, 'update'))
        )
          return false;
      }
      if (action === 'read' || action === 'download') return true;
    }
    return (
      file.ownerId === user.id ||
      acl?.effect === 'ALLOW' ||
      (await this.permissions.getAllowedScope(user)).all
    );
  }
  async accessible(user: AuthUser, id: string, action = 'read'): Promise<LinkedFile> {
    const file = await this.prisma.file.findFirst({
      where: { id, deletedAt: null },
      include: { links: true },
    });
    if (!file || !(await this.allowed(user, file, action)))
      throw new NotFoundException('File not found');
    return file;
  }
  async metadata(user: AuthUser, id: string) {
    return fileDto(await this.accessible(user, id));
  }

  async list(
    user: AuthUser,
    input: {
      folderId?: string;
      entityType?: ObjectType;
      entityId?: string;
      cursor?: string;
      limit: number;
    },
  ) {
    this.require(user, 'file.read');
    if (!!input.entityType !== !!input.entityId)
      throw new BadRequestException('Both entity fields required');
    if (input.entityType && input.entityId)
      await this.objects.assert(user, input.entityType, input.entityId);
    if (input.folderId) await this.folder(user, input.folderId);
    const grants = await this.prisma.objectPermission.findMany({
      where: { userId: user.id, objectType: 'FILE', permission: 'file.read', effect: 'ALLOW' },
      select: { objectId: true },
    });
    const scope = await this.permissions.getAllowedScope(user);
    const where: Prisma.FileWhereInput = {
      deletedAt: null,
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(input.entityType && input.entityId
        ? { links: { some: { entityType: input.entityType, entityId: input.entityId } } }
        : scope.all
          ? {}
          : { OR: [{ ownerId: user.id }, { id: { in: grants.map((g) => g.objectId) } }] }),
    };
    const visible: ReturnType<typeof fileDto>[] = [];
    let cursor = input.cursor;
    while (visible.length <= input.limit) {
      const batch = await this.prisma.file.findMany({
        where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
        include: { links: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      if (!batch.length) break;
      for (const file of batch) {
        if (await this.allowed(user, file)) visible.push(fileDto(file));
        if (visible.length > input.limit) break;
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < 100) break;
    }
    return {
      items: visible.slice(0, input.limit),
      nextCursor: visible.length > input.limit ? visible[input.limit - 1].id : null,
    };
  }

  async upload(
    user: AuthUser,
    upload: { originalname: string; buffer: Buffer },
    folderId: string | undefined,
    metadata: RequestMetadata,
    fileId?: string,
  ) {
    this.require(user, fileId ? 'file.update' : 'file.upload');
    if (!upload?.buffer || upload.buffer.length === 0 || upload.buffer.length > MAX_FILE_BYTES)
      throw new BadRequestException('File must be between 1 byte and 25 MiB');
    if (fileId) await this.accessible(user, fileId, 'update');
    if (folderId) await this.folder(user, folderId);
    const originalName = safeName(upload.originalname);
    const mimeType = detectMime(upload.buffer, originalName);
    const key = `files/${randomUUID()}`;
    const size = upload.buffer.length;
    await this.storage.put(key, upload.buffer, mimeType);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (folderId) {
          await tx.$queryRaw`SELECT id FROM "FileFolder" WHERE id = ${folderId}::uuid FOR UPDATE`;
          if (
            !(await tx.fileFolder.findFirst({
              where: { id: folderId, ownerId: user.id, deletedAt: null },
            }))
          )
            throw new NotFoundException('Folder not found');
        }
        let version = 1;
        if (fileId) {
          await tx.$queryRaw`SELECT id FROM "File" WHERE id = ${fileId}::uuid FOR UPDATE`;
          const old = await tx.file.findUniqueOrThrow({ where: { id: fileId } });
          if (old.deletedAt) throw new NotFoundException();
          version = old.version + 1;
        }
        const values = { originalName, mimeType, size, storageKey: key, version };
        const file = fileId
          ? await tx.file.update({ where: { id: fileId }, data: values })
          : await tx.file.create({ data: { ...values, ownerId: user.id, folderId } });
        await tx.fileVersion.create({
          data: { ...values, fileId: file.id, uploadedById: user.id },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: fileId ? 'file.version' : 'file.upload',
            entityType: 'FILE',
            entityId: file.id,
            newValue: { originalName, size, version },
            ...metadata,
          },
          tx,
        );
        return fileDto(file);
      });
    } catch (error) {
      try {
        await this.storage.remove(key);
      } catch {
        this.logger.error('Orphaned upload needs storage reconciliation');
      }
      throw error;
    }
  }

  async download(user: AuthUser, id: string, version?: number, preview = false) {
    const file = await this.accessible(user, id, 'download');
    const data = version
      ? await this.prisma.fileVersion.findUnique({
          where: { fileId_version: { fileId: id, version } },
        })
      : file;
    if (!data) throw new NotFoundException();
    if (
      preview &&
      !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'].includes(data.mimeType)
    )
      throw new UnsupportedMediaTypeException('Preview unavailable for this type; use download');
    const buffer = await this.storage.get(data.storageKey);
    return { buffer, mimeType: data.mimeType, name: data.originalName };
  }
  async versions(user: AuthUser, id: string) {
    await this.accessible(user, id);
    return this.prisma.fileVersion.findMany({
      where: { fileId: id },
      orderBy: { version: 'desc' },
      take: 100,
      select: {
        id: true,
        version: true,
        originalName: true,
        mimeType: true,
        size: true,
        uploadedById: true,
        createdAt: true,
      },
    });
  }
  async remove(user: AuthUser, id: string, metadata: RequestMetadata) {
    await this.accessible(user, id, 'delete');
    return this.prisma.$transaction(async (tx) => {
      await tx.file.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        { userId: user.id, action: 'file.delete', entityType: 'FILE', entityId: id, ...metadata },
        tx,
      );
      return { success: true };
    });
  }
  async link(
    user: AuthUser,
    id: string,
    entityType: ObjectType,
    entityId: string,
    remove: boolean,
    metadata: RequestMetadata,
  ) {
    if (entityType === 'FILE')
      throw new BadRequestException('File-to-file links are not supported');
    await this.accessible(user, id, 'update');
    await this.objects.assert(user, entityType, entityId, 'update');
    return this.prisma.$transaction(async (tx) => {
      if (remove) await tx.fileLink.deleteMany({ where: { fileId: id, entityType, entityId } });
      else
        await tx.fileLink.upsert({
          where: { fileId_entityType_entityId: { fileId: id, entityType, entityId } },
          create: { fileId: id, entityType, entityId },
          update: {},
        });
      await this.audit.log(
        {
          userId: user.id,
          action: remove ? 'file.unlink' : 'file.link',
          entityType: 'FILE',
          entityId: id,
          newValue: { entityType, entityId },
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }
  private async folder(user: AuthUser, id: string) {
    const folder = await this.prisma.fileFolder.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }
  async folders(user: AuthUser, parentId?: string) {
    this.require(user, 'file.read');
    if (parentId) await this.folder(user, parentId);
    return this.prisma.fileFolder.findMany({
      where: { ownerId: user.id, parentId: parentId ?? null, deletedAt: null },
      take: 100,
      orderBy: { name: 'asc' },
    });
  }
  async createFolder(
    user: AuthUser,
    name: string,
    parentId: string | undefined,
    metadata: RequestMetadata,
  ) {
    this.require(user, 'file.upload');
    if (parentId) await this.folder(user, parentId);
    return this.prisma.$transaction(async (tx) => {
      if (parentId) {
        await tx.$queryRaw`SELECT id FROM "FileFolder" WHERE id = ${parentId}::uuid FOR UPDATE`;
        if (
          !(await tx.fileFolder.findFirst({
            where: { id: parentId, ownerId: user.id, deletedAt: null },
          }))
        )
          throw new NotFoundException('Folder not found');
      }
      const folder = await tx.fileFolder.create({
        data: { name: safeName(name), parentId, ownerId: user.id },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'file.folder.create',
          entityType: 'FOLDER',
          entityId: folder.id,
          ...metadata,
        },
        tx,
      );
      return folder;
    });
  }
  async removeFolder(user: AuthUser, id: string, metadata: RequestMetadata) {
    this.require(user, 'file.delete');
    await this.folder(user, id);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "FileFolder" WHERE id = ${id}::uuid FOR UPDATE`;
        if (
          (await tx.fileFolder.count({ where: { parentId: id, deletedAt: null } })) ||
          (await tx.file.count({ where: { folderId: id, deletedAt: null } }))
        )
          throw new ConflictException('Folder is not empty');
        await tx.fileFolder.update({ where: { id }, data: { deletedAt: new Date() } });
        await this.audit.log(
          {
            userId: user.id,
            action: 'file.folder.delete',
            entityType: 'FOLDER',
            entityId: id,
            ...metadata,
          },
          tx,
        );
        return { success: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async update(
    user: AuthUser,
    id: string,
    input: { originalName?: string; folderId?: string | null },
    metadata: RequestMetadata,
  ) {
    await this.accessible(user, id, 'update');
    if (input.folderId) await this.folder(user, input.folderId);
    return this.prisma.$transaction(async (tx) => {
      if (input.folderId) {
        await tx.$queryRaw`SELECT id FROM "FileFolder" WHERE id = ${input.folderId}::uuid FOR UPDATE`;
        if (
          !(await tx.fileFolder.findFirst({
            where: { id: input.folderId, ownerId: user.id, deletedAt: null },
          }))
        )
          throw new NotFoundException('Folder not found');
      }
      const file = await tx.file.update({
        where: { id },
        data: {
          originalName: input.originalName === undefined ? undefined : safeName(input.originalName),
          folderId: input.folderId,
        },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'file.update',
          entityType: 'FILE',
          entityId: id,
          newValue: { originalName: file.originalName, folderId: file.folderId },
          ...metadata,
        },
        tx,
      );
      return fileDto(file);
    });
  }
  async updateFolder(
    user: AuthUser,
    id: string,
    name: string,
    parentId: string | null,
    metadata: RequestMetadata,
  ) {
    this.require(user, 'file.update');
    await this.folder(user, id);
    return this.prisma.$transaction(
      async (tx) => {
        let cursor = parentId;
        const seen = new Set([id]);
        while (cursor) {
          if (seen.has(cursor)) throw new BadRequestException('Folder hierarchy cycle');
          seen.add(cursor);
          const parent = await tx.fileFolder.findFirst({
            where: { id: cursor, ownerId: user.id, deletedAt: null },
          });
          if (!parent) throw new NotFoundException('Folder not found');
          cursor = parent.parentId;
        }
        const folder = await tx.fileFolder.update({
          where: { id },
          data: { name: safeName(name), parentId },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'file.folder.update',
            entityType: 'FOLDER',
            entityId: id,
            newValue: { name: folder.name, parentId },
            ...metadata,
          },
          tx,
        );
        return folder;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

import { FilesService, detectMime, safeName } from './files.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectAccessService } from '../permissions/object-access.service';
import { StorageService } from './storage.service';
import { AuditService } from '../audit/audit.service';

describe('Files access and storage', () => {
  const acl = jest.fn();
  const objectAccess = jest.fn();
  const get = jest.fn();
  const put = jest.fn();
  const remove = jest.fn();
  const transaction = jest.fn();
  const findFirst = jest.fn();
  const service = new FilesService(
    {
      objectPermission: { findUnique: acl },
      file: { findFirst },
      $transaction: transaction,
    } as unknown as PrismaService,
    { canAccess: objectAccess } as unknown as ObjectAccessService,
    { get, put, remove } as unknown as StorageService,
    {} as AuditService,
    { getAllowedScope: async () => ({ all: false, userIds: [] }) } as never,
  );
  const user = {
    id: 'owner',
    roles: ['OWNER'],
    permissions: ['file.read', 'file.download', 'file.upload'],
  };
  const file = {
    id: 'file',
    ownerId: 'owner',
    deletedAt: null,
    links: [],
  } as unknown as Parameters<FilesService['allowed']>[1];
  beforeEach(() => {
    jest.clearAllMocks();
    acl.mockResolvedValue(null);
    put.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
  });
  test('explicit deny wins even for the file owner/admin', async () => {
    acl.mockResolvedValue({ effect: 'DENY' });
    expect(await service.allowed(user, file)).toBe(false);
  });
  test('file ownership cannot bypass a linked object restriction', async () => {
    objectAccess.mockResolvedValue(false);
    const linked = { ...file, links: [{ entityType: 'DEAL', entityId: 'd' }] } as typeof file;
    expect(await service.allowed(user, linked, 'download')).toBe(false);
    findFirst.mockResolvedValue(linked);
    await expect(service.download(user, 'file')).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  test('shared object permits read but does not permit unrelated users to edit', async () => {
    objectAccess.mockResolvedValue(true);
    const other = { id: 'other', roles: ['EMPLOYEE'], permissions: ['file.read', 'file.update'] };
    const linked = { ...file, links: [{ entityType: 'CLIENT', entityId: 'c' }] } as typeof file;
    expect(await service.allowed(other, linked)).toBe(true);
    expect(await service.allowed(other, linked, 'update')).toBe(false);
  });
  test('failed metadata transaction compensates an already uploaded object', async () => {
    transaction.mockRejectedValue(new Error('DB failed'));
    await expect(
      service.upload(
        user,
        { originalname: 'note.txt', buffer: Buffer.from('hello') },
        undefined,
        {},
      ),
    ).rejects.toThrow('DB failed');
    expect(put).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(put.mock.calls[0][0]);
  });
  test('MIME comes from bytes and active content has no inline preview', () => {
    expect(detectMime(Buffer.from('<script>alert(1)</script>'), 'fake.png')).toBe(
      'application/octet-stream',
    );
    expect(detectMime(Buffer.from('hello'), 'note.txt')).toBe('text/plain');
    expect(safeName('C:\\private\\file.txt')).toBe('file.txt');
    expect(() => safeName('..')).toThrow();
  });
});

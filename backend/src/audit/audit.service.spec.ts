import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
test('audit redacts nested credentials and writes through the provided transaction', async () => {
  const create = jest.fn().mockResolvedValue({});
  const tx = { auditLog: { create } };
  const service = new AuditService({} as PrismaService);
  await service.log(
    {
      action: 'user.update',
      entityType: 'USER',
      newValue: { passwordHash: 'secret', nested: [{ refreshTokenHash: 'token', name: 'ok' }] },
    },
    tx as unknown as Parameters<AuditService['log']>[1],
  );
  expect(create.mock.calls[0][0].data.newValue).toEqual({ nested: [{ name: 'ok' }] });
});

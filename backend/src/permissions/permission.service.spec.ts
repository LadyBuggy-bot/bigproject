import { PermissionService } from './permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthUser } from '../auth/types/auth-user.type';

describe('PermissionService policy boundaries', () => {
  const acl = jest.fn();
  const children = jest.fn().mockResolvedValue(['child', 'grandchild']);
  const service = new PermissionService(
    { objectPermission: { findUnique: acl } } as unknown as PrismaService,
    { getSubordinateUserIds: children } as unknown as UsersService,
  );
  const user = (role: string, permissions = ['client.read']): AuthUser => ({
    id: 'me',
    roles: [role],
    permissions,
  });
  const client = (responsibleUserId: string) => ({
    id: 'client',
    type: 'CLIENT' as const,
    responsibleUserId,
  });
  beforeEach(() => {
    acl.mockReset();
    acl.mockResolvedValue(null);
  });
  test.each(['OWNER', 'ADMIN'])('%s has ALL only with the base permission', async (role) => {
    expect(await service.canAccessObject(user(role), 'client.read', client('other'))).toBe(true);
    expect(await service.canAccessObject(user(role, []), 'client.read', client('other'))).toBe(
      false,
    );
  });
  test('explicit DENY overrides OWNER and scope', async () => {
    acl.mockResolvedValue({ effect: 'DENY' });
    expect(await service.canAccessObject(user('OWNER'), 'client.read', client('me'))).toBe(false);
  });
  test('manager includes descendants, excludes unrelated users', async () => {
    expect(
      await service.canAccessObject(user('MANAGER'), 'client.read', client('grandchild')),
    ).toBe(true);
    expect(await service.canAccessObject(user('MANAGER'), 'client.read', client('other'))).toBe(
      false,
    );
  });
  test('sales manager only sees own client', async () => {
    expect(await service.canAccessObject(user('SALES_MANAGER'), 'client.read', client('me'))).toBe(
      true,
    );
    expect(
      await service.canAccessObject(user('SALES_MANAGER'), 'client.read', client('other')),
    ).toBe(false);
  });
  test('explicit grant cannot replace a missing base permission', async () => {
    acl.mockResolvedValue({ effect: 'ALLOW' });
    expect(await service.canAccessObject(user('GUEST', []), 'client.read', client('me'))).toBe(
      false,
    );
  });
  test('observer cannot modify, guest cannot read unshared tasks', async () => {
    expect(await service.canAccessObject(user('OBSERVER'), 'client.update', client('me'))).toBe(
      false,
    );
    expect(
      await service.canAccessObject(user('GUEST', ['task.read']), 'task.read', {
        id: 'task',
        type: 'TASK',
      }),
    ).toBe(false);
  });
  test('employee assigned/participating tasks work without unrelated access', async () => {
    const employee = user('EMPLOYEE', ['task.read']);
    expect(
      await service.canAccessObject(employee, 'task.read', {
        id: 'task',
        type: 'TASK',
        assigneeId: 'me',
      }),
    ).toBe(true);
    expect(
      await service.canAccessObject(employee, 'task.read', {
        id: 'task',
        type: 'TASK',
        participantUserIds: ['me'],
      }),
    ).toBe(true);
    expect(
      await service.canAccessObject(employee, 'task.read', {
        id: 'task',
        type: 'TASK',
        assigneeId: 'other',
      }),
    ).toBe(false);
  });
  test('custom roles default to explicit access', async () => {
    expect(await service.canAccessObject(user('CUSTOM'), 'client.read', client('me'))).toBe(false);
    acl.mockResolvedValue({ effect: 'ALLOW' });
    expect(await service.canAccessObject(user('CUSTOM'), 'client.read', client('other'))).toBe(
      true,
    );
  });
  test('exports and AI retain the requesting user permissions', async () => {
    const requestUser = user('SALES_MANAGER');
    expect(await service.canAccessObject(requestUser, 'client.export', client('me'))).toBe(false);
    expect(await service.canAccessObject(requestUser, 'client.read', client('other'))).toBe(false);
  });
  test('permission from another domain cannot unlock a client', async () => {
    expect(
      await service.canAccessObject(user('OWNER', ['task.read']), 'task.read', client('me')),
    ).toBe(false);
  });
  test('amount filtering does not mutate the original; secrets never returned', () => {
    const deal = { id: 'd', amount: '100', passwordHash: 'secret' };
    expect(service.filterFields(user('OWNER', []), 'deal', deal)).toEqual({ id: 'd' });
    expect(service.filterFields(user('OWNER', ['deal.field.amount.read']), 'deal', deal)).toEqual({
      id: 'd',
      amount: '100',
    });
    expect(deal.amount).toBe('100');
  });
  test('nested relations do not leak amounts or credentials', () => {
    expect(
      service.filterFields(user('EMPLOYEE', []), 'client', {
        deals: [{ amount: '100', user: { passwordHash: 'secret', id: 'u' } }],
      }),
    ).toEqual({ deals: [{ user: { id: 'u' } }] });
  });
});

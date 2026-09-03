import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
test('hierarchy traversal terminates on corrupt cycles and includes indirect reports', async () => {
  const findMany = jest
    .fn()
    .mockResolvedValueOnce([{ id: 'child' }])
    .mockResolvedValueOnce([{ id: 'grandchild' }])
    .mockResolvedValueOnce([{ id: 'root' }]);
  const service = new UsersService({ user: { findMany } } as unknown as PrismaService);
  expect(await service.getSubordinateUserIds('root')).toEqual(['child', 'grandchild']);
  expect(findMany).toHaveBeenCalledTimes(3);
});

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubordinateUserIds(managerId: string): Promise<string[]> {
    // Walk through inactive intermediate managers too; history still belongs to the tree.
    const seen = new Set<string>([managerId]);
    let parents = [managerId];
    const result: string[] = [];
    while (parents.length) {
      const children = await this.prisma.user.findMany({
        where: { managerId: { in: parents } },
        select: { id: true },
      });
      parents = children.map(({ id }) => id).filter((id) => !seen.has(id));
      parents.forEach((id) => seen.add(id));
      result.push(...parents);
    }
    return result;
  }
}

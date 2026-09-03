import { Injectable } from '@nestjs/common';
import { ObjectType } from '@prisma/client';
import { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

export interface AccessObject {
  id: string;
  type: ObjectType;
  responsibleUserId?: string;
  authorId?: string;
  assigneeId?: string;
  participantUserIds?: string[];
  // Must come from a trusted project membership query, never from request input.
  projectMemberUserIds?: string[];
  projectManagerId?: string;
}

export const SECRET_FIELDS = new Set([
  'passwordHash',
  'password',
  'refreshTokenHash',
  'totpSecret',
  'totpSecretEncrypted',
  'totpPendingEncrypted',
  'recoveryCodeHashes',
  'recoveryCodes',
  'challengeToken',
  'tokenHash',
  'secret',
  'apiSecret',
  'apiKey',
  'smtpPassword',
  'telegramToken',
  'aiProviderKey',
]);

@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  hasPermission(user: AuthUser, permission: string): boolean {
    return user.permissions.includes(permission);
  }

  async getAllowedScope(user: AuthUser): Promise<{ all: boolean; userIds: string[] }> {
    if (user.roles.some((role) => ['OWNER', 'ADMIN'].includes(role))) {
      return { all: true, userIds: [] };
    }
    if (user.roles.includes('MANAGER')) {
      return {
        all: false,
        userIds: [user.id, ...(await this.users.getSubordinateUserIds(user.id))],
      };
    }
    if (user.roles.some((role) => ['EMPLOYEE', 'SALES_MANAGER'].includes(role))) {
      return { all: false, userIds: [user.id] };
    }
    return { all: false, userIds: [] };
  }

  async canAccessObject(
    user: AuthUser,
    permission: string,
    object: AccessObject,
  ): Promise<boolean> {
    if (
      !permission.startsWith(`${object.type.toLowerCase()}.`) ||
      !this.hasPermission(user, permission)
    )
      return false;
    const acl = await this.prisma.objectPermission.findUnique({
      where: {
        userId_objectType_objectId_permission: {
          userId: user.id,
          objectType: object.type,
          objectId: object.id,
          permission,
        },
      },
    });
    if (acl?.effect === 'DENY') return false;
    if (acl?.effect === 'ALLOW') return true;
    const scope = await this.getAllowedScope(user);
    if (scope.all) return true;
    if (object.type === 'CLIENT' || object.type === 'DEAL') {
      // EMPLOYEE needs explicit CRM access; ownership alone is not a CRM policy grant.
      return (
        user.roles.some((role) => ['MANAGER', 'SALES_MANAGER'].includes(role)) &&
        !!object.responsibleUserId &&
        scope.userIds.includes(object.responsibleUserId)
      );
    }
    if (object.type === 'TASK' && scope.userIds.length) {
      return (
        [object.authorId, object.assigneeId].some((id) => !!id && scope.userIds.includes(id)) ||
        !!object.participantUserIds?.includes(user.id) ||
        !!object.projectMemberUserIds?.includes(user.id) ||
        (user.roles.includes('MANAGER') && object.projectManagerId === user.id)
      );
    }
    // Other domains must explicitly provide a policy; never inherit a generic OWN shortcut.
    return false;
  }

  filterFields(
    user: AuthUser,
    resource: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const protectedFields: Record<string, string[]> = {
      deal: ['amount'],
      project: ['plannedBudget', 'actualBudget'],
      client: ['personalData'],
    };
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SECRET_FIELDS.has(key)) continue;
      if (key === 'customFields') continue; // Unknown/custom fields require the asynchronous policy below.
      if (
        protectedFields[resource]?.includes(key) &&
        !this.hasPermission(user, `${resource}.field.${key}.read`)
      )
        continue;
      const nestedResource =
        (
          {
            deal: 'deal',
            deals: 'deal',
            client: 'client',
            clients: 'client',
            project: 'project',
            projects: 'project',
          } as Record<string, string>
        )[key] ?? resource;
      const filterNested = (item: unknown): unknown => {
        if (Array.isArray(item)) return item.map(filterNested);
        if (
          item !== null &&
          typeof item === 'object' &&
          Object.getPrototypeOf(item) === Object.prototype
        ) {
          return this.filterFields(user, nestedResource, item as Record<string, unknown>);
        }
        return item;
      };
      result[key] = filterNested(value);
    }
    return result;
  }
  async filterCustomFields(
    user: AuthUser,
    resource: 'client' | 'deal',
    data: Record<string, unknown>,
  ) {
    const result = this.filterFields(user, resource, data);
    if (
      data.customFields &&
      typeof data.customFields === 'object' &&
      !Array.isArray(data.customFields)
    ) {
      const definitions = await this.prisma.customFieldDefinition.findMany({
        where: { entity: resource === 'client' ? 'CLIENT' : 'DEAL', isActive: true },
        select: { key: true, fieldCode: true },
      });
      const source = data.customFields as Record<string, unknown>;
      result.customFields = Object.fromEntries(
        definitions
          .filter(
            (def) =>
              !SECRET_FIELDS.has(def.key) &&
              this.hasPermission(user, def.fieldCode) &&
              Object.hasOwn(source, def.key),
          )
          .map((def) => [
            def.key,
            this.filterFields(user, resource, { value: source[def.key] }).value,
          ]),
      );
    }
    return result;
  }
}

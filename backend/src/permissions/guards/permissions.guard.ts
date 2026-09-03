import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../../auth/types/auth-user.type';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permissions.decorator';
import { PermissionService } from '../permission.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    // Use this guard on protected routes only. Missing declarations are configuration errors, denied safely.
    if (
      !user ||
      !required?.length ||
      !required.every((permission) => this.permissions.hasPermission(user, permission))
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}

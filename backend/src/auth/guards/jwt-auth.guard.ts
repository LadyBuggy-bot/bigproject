import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService, AccessClaims } from '../auth.service';
import { AuthUser } from '../types/auth-user.type';
import { IS_PUBLIC } from '../decorators/public.decorator';

export interface AuthRequest extends Request {
  user: AuthUser;
  auth: AccessClaims;
  requestId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = request.headers.authorization?.match(/^Bearer (\S+)$/i);
    if (!match) throw new UnauthorizedException();
    const { user, claims } = await this.authService.authenticate(match[1]);
    request.user = user;
    request.auth = claims;
    return true;
  }
}

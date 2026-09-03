import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { AuthRequest } from './guards/jwt-auth.guard';

class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(1024) password!: string;
}
class RefreshDto {
  @IsString() @MaxLength(200) refreshToken!: string;
}

export function requestMetadata(request: AuthRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent']?.slice(0, 512),
    requestId: request.requestId,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto, @Req() request: AuthRequest) {
    return this.auth.login(dto.email, dto.password, requestMetadata(request));
  }
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  refresh(@Body() dto: RefreshDto, @Req() request: AuthRequest) {
    return this.auth.refresh(dto.refreshToken, requestMetadata(request));
  }
  @Post('logout')
  @HttpCode(200)
  logout(@Req() request: AuthRequest) {
    return this.auth.logout(request.user.id, request.auth.sid, requestMetadata(request));
  }
  @Post('logout-all')
  @HttpCode(200)
  logoutAll(@Req() request: AuthRequest) {
    return this.auth.logout(request.user.id, undefined, requestMetadata(request));
  }
}

@Controller('users')
export class CurrentUserController {
  @Get('me')
  me(@Req() request: AuthRequest) {
    return request.user;
  }
}

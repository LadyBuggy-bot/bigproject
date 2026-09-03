import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { TwoFactorService } from './two-factor.service';
import { AuthService } from './auth.service';
import { AuthRequest } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { requestMetadata } from './auth.controller';
import { SecurityService } from './security.service';

class PasswordDto {
  @IsString() @MaxLength(1024) password!: string;
}
class CodeDto {
  @Matches(/^(\d{6}|[a-f0-9]{32})$/) code!: string;
}
class VerifyDto extends CodeDto {
  @Matches(/^[a-f0-9]{64}$/) challengeToken!: string;
}
class DisableDto extends CodeDto {
  @IsString() @MaxLength(1024) password!: string;
}
class ChangePasswordDto extends PasswordDto {
  @IsString() @MinLength(12) @MaxLength(1024) newPassword!: string;
}
class ResetPasswordDto {
  @IsString() @MinLength(12) @MaxLength(1024) password!: string;
}

@Controller('auth/2fa')
@Throttle({ default: { limit: 5, ttl: 60000 } })
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly auth: AuthService,
    private readonly security: SecurityService,
  ) {}
  @Get('status') status(@Req() req: AuthRequest) {
    return this.security.status(req.user.id);
  }
  @Post('setup') setup(@Body() dto: PasswordDto, @Req() req: AuthRequest) {
    return this.twoFactor.setup(req.user.id, dto.password, requestMetadata(req));
  }
  @Post('enable') enable(@Body() dto: CodeDto, @Req() req: AuthRequest) {
    return this.twoFactor.enable(req.user.id, req.auth.sid, dto.code, requestMetadata(req));
  }
  @Public() @Post('verify') @HttpCode(200) verify(@Body() dto: VerifyDto, @Req() req: AuthRequest) {
    return this.auth.verifyTwoFactor(dto.challengeToken, dto.code, requestMetadata(req));
  }
  @Post('disable') disable(@Body() dto: DisableDto, @Req() req: AuthRequest) {
    return this.twoFactor.disable(req.user.id, dto.password, dto.code, requestMetadata(req));
  }
}

@Controller()
export class SecurityController {
  constructor(private readonly service: SecurityService) {}
  @Get('sessions') list(@Req() req: AuthRequest) {
    return this.service.sessions(req.user.id, req.auth.sid);
  }
  @Get('users/:id/sessions') userSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.sessionsFor(req.user, id);
  }
  @Post('users/:id/password') resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.resetPassword(req.user, id, dto.password, requestMetadata(req));
  }
  @Delete('sessions/:id') revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.revoke(req.user, id, requestMetadata(req));
  }
  @Post('auth/password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  password(@Body() dto: ChangePasswordDto, @Req() req: AuthRequest) {
    return this.service.changePassword(
      req.user.id,
      dto.password,
      dto.newPassword,
      requestMetadata(req),
    );
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthController, CurrentUserController } from './auth.controller';
import { TwoFactorService } from './two-factor.service';
import { SecurityService } from './security.service';
import { SecurityController, TwoFactorController } from './security.controller';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
        if (Buffer.byteLength(secret) < 32 || /change_me/i.test(secret))
          throw new Error('JWT_ACCESS_SECRET must be a unique random secret of at least 32 bytes');
        return {
          secret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: 900,
            issuer: 'bigproject',
            audience: 'bigproject-api',
          },
          verifyOptions: {
            algorithms: ['HS256'],
            issuer: 'bigproject',
            audience: 'bigproject-api',
          },
        };
      },
    }),
  ],
  controllers: [AuthController, CurrentUserController, SecurityController, TwoFactorController],
  providers: [AuthService, PasswordService, JwtAuthGuard, TwoFactorService, SecurityService],
  exports: [AuthService, PasswordService, JwtAuthGuard],
})
export class AuthModule {}

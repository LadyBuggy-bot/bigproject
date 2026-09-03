import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';
import type { RequestMetadata } from './auth.service';

export const credentialHash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  private key(): Buffer {
    const value = this.config.get<string>('TOTP_ENCRYPTION_KEY') ?? '';
    if (!/^[a-f0-9]{64}$/i.test(value))
      throw new ServiceUnavailableException('Two-factor encryption is not configured');
    return Buffer.from(value, 'hex');
  }
  encrypt(secret: string, userId: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), nonce);
    cipher.setAAD(Buffer.from(userId));
    const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [nonce, cipher.getAuthTag(), data].map((value) => value.toString('base64url')).join('.');
  }
  decrypt(encoded: string, userId: string): string {
    const [nonce, tag, data] = encoded.split('.').map((value) => Buffer.from(value, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), nonce);
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  async setup(userId: string, password: string, metadata: RequestMetadata) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.status !== 'ACTIVE' || !(await this.passwords.verify(password, user.passwordHash)))
        throw new UnauthorizedException();
      if (user.totpSecretEncrypted)
        throw new BadRequestException('Two-factor authentication is already enabled');
      const secret = generateSecret();
      await tx.user.update({
        where: { id: userId },
        data: {
          totpPendingEncrypted: this.encrypt(secret, userId),
          totpPendingExpiresAt: new Date(Date.now() + 600000),
        },
      });
      await this.audit.log(
        { userId, action: 'auth.2fa.setup', entityType: 'USER', entityId: userId, ...metadata },
        tx,
      );
      return {
        secret,
        otpauthUri: generateURI({ issuer: 'BigProject', label: user.email, secret }),
        expiresIn: 600,
      };
    });
  }

  async enable(userId: string, sessionId: string, code: string, metadata: RequestMetadata) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        user.status !== 'ACTIVE' ||
        user.totpSecretEncrypted ||
        !user.totpPendingEncrypted ||
        !user.totpPendingExpiresAt ||
        user.totpPendingExpiresAt <= new Date()
      )
        throw new BadRequestException('No active enrollment');
      const result = await verify({
        secret: this.decrypt(user.totpPendingEncrypted, userId),
        token: code,
        epochTolerance: 30,
      });
      if (!result.valid || !('timeStep' in result)) throw new UnauthorizedException('Invalid code');
      const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
      await tx.user.update({
        where: { id: userId },
        data: {
          totpSecretEncrypted: user.totpPendingEncrypted,
          totpPendingEncrypted: null,
          totpPendingExpiresAt: null,
          totpLastStep: result.timeStep,
          recoveryCodeHashes: recoveryCodes.map((code) => credentialHash(`${userId}:${code}`)),
          securityVersion: { increment: 1 },
        },
      });
      await tx.session.updateMany({
        where: { userId, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        { userId, action: 'auth.2fa.enable', entityType: 'USER', entityId: userId, ...metadata },
        tx,
      );
      return { enabled: true, recoveryCodes };
    });
  }

  // Caller holds User FOR UPDATE, so recovery codes and TOTP steps can be consumed only once.
  async consumeCode(tx: Prisma.TransactionClient, user: User, code: string): Promise<boolean> {
    if (!user.totpSecretEncrypted) return false;
    if (/^[a-f0-9]{32}$/.test(code)) {
      const hash = credentialHash(`${user.id}:${code}`);
      if (!user.recoveryCodeHashes.includes(hash)) return false;
      await tx.user.update({
        where: { id: user.id },
        data: { recoveryCodeHashes: user.recoveryCodeHashes.filter((value) => value !== hash) },
      });
      return true;
    }
    if (!/^\d{6}$/.test(code)) return false;
    const result = await verify({
      secret: this.decrypt(user.totpSecretEncrypted, user.id),
      token: code,
      epochTolerance: 30,
      afterTimeStep: user.totpLastStep ?? undefined,
    });
    if (!result.valid || !('timeStep' in result)) return false;
    await tx.user.update({ where: { id: user.id }, data: { totpLastStep: result.timeStep } });
    return true;
  }

  async challenge(tx: Prisma.TransactionClient, user: User) {
    const challengeToken = randomBytes(32).toString('hex');
    // Only the newest password-authenticated challenge remains usable.
    await tx.authChallenge.deleteMany({ where: { userId: user.id } });
    await tx.authChallenge.create({
      data: {
        userId: user.id,
        tokenHash: credentialHash(challengeToken),
        securityVersion: user.securityVersion,
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    return { requiresTwoFactor: true as const, challengeToken, expiresIn: 300 };
  }

  async consumeChallenge(
    tx: Prisma.TransactionClient,
    token: string,
    code: string,
  ): Promise<User | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const first = await tx.authChallenge.findUnique({
      where: { tokenHash: credentialHash(token) },
    });
    if (!first) return null;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${first.userId}::uuid FOR UPDATE`;
    const challenge = await tx.authChallenge.findUnique({ where: { id: first.id } });
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= 5
    )
      return null;
    const user = await tx.user.findUniqueOrThrow({ where: { id: challenge.userId } });
    if (
      user.status !== 'ACTIVE' ||
      user.deletedAt ||
      user.securityVersion !== challenge.securityVersion
    )
      return null;
    await tx.authChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    if (!(await this.consumeCode(tx, user, code))) return null; // Commit failed-attempt counter.
    await tx.authChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    return user;
  }

  async disable(userId: string, password: string, code: string, metadata: RequestMetadata) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        !(await this.passwords.verify(password, user.passwordHash)) ||
        !(await this.consumeCode(tx, user, code))
      )
        throw new UnauthorizedException();
      await tx.user.update({
        where: { id: userId },
        data: {
          totpSecretEncrypted: null,
          totpLastStep: null,
          recoveryCodeHashes: [],
          totpPendingEncrypted: null,
          totpPendingExpiresAt: null,
          securityVersion: { increment: 1 },
        },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        { userId, action: 'auth.2fa.disable', entityType: 'USER', entityId: userId, ...metadata },
        tx,
      );
      return { enabled: false, requiresLogin: true };
    });
  }
}

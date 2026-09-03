// Isolated HTTP -> Nest -> Prisma -> PostgreSQL protocol integration.
// Never reads a developer's DATABASE_URL and never sends external notifications.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const { Test } = require('@nestjs/testing');
const { getQueueToken } = require('@nestjs/bullmq');
const { ValidationPipe, VersioningType } = require('@nestjs/common');
const request = require('supertest');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { generate } = require('otplib');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PasswordService } = require('../dist/auth/password.service');
const { StorageService } = require('../dist/files/storage.service');
const { NotificationsService } = require('../dist/notifications/notifications.service');

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

(async () => {
  const db = await PGlite.create();
  let server;
  let prisma;
  let app;
  try {
    const migrations = path.join(__dirname, '../prisma/migrations');
    for (const entry of fs.readdirSync(migrations).sort()) {
      const sql = path.join(migrations, entry, 'migration.sql');
      if (fs.existsSync(sql)) await db.exec(fs.readFileSync(sql, 'utf8'));
    }
    const port = await freePort();
    server = new PGLiteSocketServer({ db, host: '127.0.0.1', port });
    await server.start();
    const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable&connection_limit=1`;
    process.env.DATABASE_URL = url;
    process.env.JWT_ACCESS_SECRET = randomBytes(32).toString('hex');
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    process.env.VALKEY_URL = 'redis://127.0.0.1:1';
    process.env.NOTIFICATION_DELIVERY_ENABLED = 'false';
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const codes = [
      'user.read',
      'user.create',
      'user.update',
      'user.block',
      'user.dismiss',
      'user.manage_roles',
      'user.manage_sessions',
      'role.read',
      'role.create',
      'role.update',
      'role.delete',
      'role.assign',
      'permission.read',
      'permission.manage',
      'audit.read',
      'audit.export',
      'file.read',
      'file.upload',
      'file.update',
      'file.delete',
      'file.download',
      'client.read',
      'client.update',
      'notification.manage',
    ];
    for (const code of codes) await prisma.permission.create({ data: { code } });
    const all = await prisma.permission.findMany();
    const ownerRole = await prisma.role.create({
      data: {
        name: 'OWNER',
        isSystem: true,
        permissions: { create: all.map((p) => ({ permissionId: p.id })) },
      },
    });
    const salesRole = await prisma.role.create({
      data: {
        name: 'SALES_MANAGER',
        isSystem: true,
        permissions: {
          create: all
            .filter((p) => p.code.startsWith('file.') || p.code.startsWith('client.'))
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });
    const password = 'integration-test-password-only';
    const owner = await prisma.user.create({
      data: {
        email: 'owner@example.invalid',
        firstName: 'Test',
        lastName: 'Owner',
        passwordHash: await new PasswordService().hash(password),
        roles: { create: { roleId: ownerRole.id } },
      },
    });
    const objects = new Map();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(getQueueToken('crm'))
      .useValue({ name: 'crm', close: async () => {} })
      .overrideProvider(StorageService)
      .useValue({
        put: async (key, body) => objects.set(key, Buffer.from(body)),
        get: async (key) => objects.get(key),
        remove: async (key) => objects.delete(key),
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    const api = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Core integration').setVersion('1').build(),
    );
    assert(api.paths['/api/v1/auth/2fa/verify']);
    assert(api.components.schemas.LoginDto.properties.email);
    const http = request(app.getHttpServer());
    const adminLogin = await http
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password })
      .expect(200);
    const admin = `Bearer ${adminLogin.body.accessToken}`;
    const created = await http
      .post('/api/v1/users')
      .set('Authorization', admin)
      .send({ email: 'sales@example.invalid', firstName: 'Sales', lastName: 'Test', password })
      .expect(201);
    const userId = created.body.id;
    assert(!JSON.stringify(created.body).includes('password'));
    await http
      .put(`/api/v1/users/${userId}/roles`)
      .set('Authorization', admin)
      .send({ roleIds: [salesRole.id] })
      .expect(200);
    await http
      .patch(`/api/v1/users/${userId}/manager`)
      .set('Authorization', admin)
      .send({ managerId: userId })
      .expect(400);
    const initial = await http
      .post('/api/v1/auth/login')
      .send({ email: 'sales@example.invalid', password })
      .expect(200);
    const initialAuth = `Bearer ${initial.body.accessToken}`;
    const enrollment = await http
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', initialAuth)
      .send({ password })
      .expect(201);
    const code = await generate({ secret: enrollment.body.secret });
    const enabled = await http
      .post('/api/v1/auth/2fa/enable')
      .set('Authorization', initialAuth)
      .send({ code })
      .expect(201);
    assert.equal(enabled.body.recoveryCodes.length, 10);
    const challenge = await http
      .post('/api/v1/auth/login')
      .send({ email: 'sales@example.invalid', password })
      .expect(200);
    assert.equal(challenge.body.requiresTwoFactor, true);
    assert.equal(challenge.body.accessToken, undefined);
    const verified = await http
      .post('/api/v1/auth/2fa/verify')
      .send({ challengeToken: challenge.body.challengeToken, code: enabled.body.recoveryCodes[0] })
      .expect(200);
    const auth = `Bearer ${verified.body.accessToken}`;
    await http
      .post('/api/v1/auth/2fa/verify')
      .send({ challengeToken: challenge.body.challengeToken, code: enabled.body.recoveryCodes[0] })
      .expect(401);
    const freshChallenge = await http
      .post('/api/v1/auth/login')
      .send({ email: 'sales@example.invalid', password })
      .expect(200);
    await http
      .post('/api/v1/auth/2fa/verify')
      .send({
        challengeToken: freshChallenge.body.challengeToken,
        code: enabled.body.recoveryCodes[0],
      })
      .expect(401);
    assert.equal((await prisma.authChallenge.findFirst({ where: { userId } })).attempts, 1);
    const client = await prisma.client.create({
      data: { type: 'LEGAL_ENTITY', name: 'Fixture client', responsibleUserId: userId },
    });
    const upload = await http
      .post('/api/v1/files')
      .set('Authorization', auth)
      .attach('file', Buffer.from('first version'), 'note.txt')
      .expect(201);
    const fileId = upload.body.id;
    assert.equal(upload.body.storageKey, undefined);
    await http
      .post(`/api/v1/files/${fileId}/links`)
      .set('Authorization', auth)
      .send({ entityType: 'CLIENT', entityId: client.id })
      .expect(201);
    await http
      .get(`/api/v1/files/${fileId}/download`)
      .set('Authorization', auth)
      .expect(200, 'first version');
    await http
      .post(`/api/v1/files/${fileId}/versions`)
      .set('Authorization', auth)
      .attach('file', Buffer.from('second version'), 'note.txt')
      .expect(201);
    await http
      .get(`/api/v1/files/${fileId}/download?version=1`)
      .set('Authorization', auth)
      .expect(200, 'first version');
    const denied = await http
      .post('/api/v1/permissions/acl')
      .set('Authorization', admin)
      .send({
        userId,
        objectType: 'CLIENT',
        objectId: client.id,
        permission: 'client.read',
        effect: 'DENY',
      })
      .expect(201);
    await http.get(`/api/v1/files/${fileId}/download`).set('Authorization', auth).expect(404);
    await http
      .delete(`/api/v1/permissions/acl/${denied.body.id}`)
      .set('Authorization', admin)
      .expect(200);
    const notifications = app.get(NotificationsService);
    const input = {
      userId,
      eventKey: 'integration-event',
      type: 'client.updated',
      title: 'Sensitive title',
      message: 'Sensitive body',
      entityType: 'CLIENT',
      entityId: client.id,
    };
    const first = await notifications.create(input);
    const duplicate = await notifications.create(input);
    assert.equal(first.id, duplicate.id);
    assert.equal(await prisma.notification.count({ where: { userId } }), 1);
    const inbox = await http.get('/api/v1/notifications').set('Authorization', auth).expect(200);
    assert.equal(inbox.body.items.length, 1);
    assert(!JSON.stringify(inbox.body).includes('Sensitive'));
    await http
      .post(`/api/v1/notifications/${first.id}/read`)
      .set('Authorization', auth)
      .expect(201);
    const adminInbox = await http
      .get('/api/v1/notifications')
      .set('Authorization', admin)
      .expect(200);
    assert.equal(adminInbox.body.items.length, 0);
    await http
      .patch(`/api/v1/users/${userId}/status`)
      .set('Authorization', admin)
      .send({ status: 'DISMISSED' })
      .expect(409);
    await http
      .patch(`/api/v1/users/${userId}/status`)
      .set('Authorization', admin)
      .send({ status: 'DISMISSED', successorId: owner.id })
      .expect(200);
    assert.equal(
      (await prisma.client.findUnique({ where: { id: client.id } })).responsibleUserId,
      owner.id,
    );
    await http.get('/api/v1/users/me').set('Authorization', auth).expect(401);
    const audits = await http
      .get('/api/v1/audit?limit=100')
      .set('Authorization', admin)
      .expect(200);
    assert(audits.body.items.some((row) => row.action === 'user.responsibilities.transfer'));
    const auditText = JSON.stringify(audits.body);
    assert(!auditText.includes(password));
    assert(!auditText.includes(enrollment.body.secret));
    console.log(
      'Core integration passed: login, User/Roles, hierarchy cycle, 2FA enrollment/recovery/replay, persisted attempt limit, file upload/version/download/ACL, idempotent inbox, dismissal transfer, token revocation, audit redaction.',
    );
  } finally {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (server) await server.stop();
    await db.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

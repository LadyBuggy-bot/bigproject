import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Core HTTP wiring', () => {
  let app: INestApplication;
  const findFirst = jest.fn();
  const createUser = jest.fn();
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  const oldValkey = process.env.VALKEY_URL;
  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-only-secret-with-at-least-32-bytes';
    process.env.VALKEY_URL = 'redis://127.0.0.1:6379';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        session: { findFirst },
        user: { create: createUser },
        $queryRaw: jest.fn().mockResolvedValue([]),
      })
      .overrideProvider(getQueueToken('crm'))
      .useValue({ name: 'crm', close: jest.fn() })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = oldSecret;
    if (oldValkey === undefined) delete process.env.VALKEY_URL;
    else process.env.VALKEY_URL = oldValkey;
  });
  test('health is public; me is authenticated', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });
  test('invalid login input is rejected before business logic', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bad', password: 'x', roles: ['ADMIN'] })
      .expect(400);
  });
  test('authenticated user gets only AuthUser and cannot create users without permission', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const token = app
      .get(JwtService)
      .sign({ sub: id, sid: '22222222-2222-4222-8222-222222222222', kind: 'access' });
    findFirst.mockResolvedValue({ userId: id, user: { passwordHash: 'SECRET', roles: [] } });
    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({ id, roles: [], permissions: [] });
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
    expect(createUser).not.toHaveBeenCalled();
  });
});

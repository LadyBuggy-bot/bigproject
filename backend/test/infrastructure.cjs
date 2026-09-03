// Explicit opt-in; only dedicated test services. Does not load ../.env or use DATABASE_URL.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { Queue, QueueEvents, Worker } = require('bullmq');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { StorageService } = require('../dist/files/storage.service');
const { parseQueueConnection } = require('../dist/queues/queues.module');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Service timeout')), 20000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  if (required('RUN_CORE_INFRASTRUCTURE_TESTS') !== '1')
    throw new Error('Explicit opt-in required');
  const databaseUrl = required('CORE_TEST_DATABASE_URL');
  const bucket = required('CORE_TEST_S3_BUCKET');
  if (!new URL(databaseUrl).pathname.endsWith('_core_test') || !bucket.endsWith('-core-test'))
    throw new Error('Dedicated *_core_test database and *-core-test bucket required');
  const connection = parseQueueConnection(required('CORE_TEST_VALKEY_URL'));
  const prefix = `core-test-${randomUUID()}`;
  const prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
  const storage = new StorageService(
    new ConfigService({
      S3_ENDPOINT: required('CORE_TEST_S3_ENDPOINT'),
      S3_BUCKET: bucket,
      S3_ACCESS_KEY: required('CORE_TEST_S3_ACCESS_KEY'),
      S3_SECRET_KEY: required('CORE_TEST_S3_SECRET_KEY'),
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: 'true',
    }),
  );
  const queue = new Queue('crm', { prefix, connection });
  const events = new QueueEvents('crm', {
    prefix,
    connection: { ...connection, maxRetriesPerRequest: null },
  });
  const worker = new Worker('crm', async (job) => job.data.value * 2, {
    prefix,
    connection: { ...connection, maxRetriesPerRequest: null },
  });
  events.on('error', () => {});
  worker.on('error', () => {});
  queue.on('error', () => {});
  let userId;
  const storageKey = `${prefix}/round-trip`;
  let uploaded = false;
  try {
    await bounded(prisma.$connect());
    const user = await prisma.user.create({
      data: {
        email: `${prefix}@example.invalid`,
        firstName: 'Core',
        lastName: 'Test',
        passwordHash: 'fixture-only-never-login',
      },
    });
    userId = user.id;
    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: 'old-fixture-hash',
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const outcomes = await Promise.all(
      ['first', 'second'].map((hash) =>
        prisma.session.updateMany({
          where: { id: session.id, refreshTokenHash: 'old-fixture-hash' },
          data: { refreshTokenHash: hash },
        }),
      ),
    );
    assert.equal(
      outcomes.reduce((sum, result) => sum + result.count, 0),
      1,
      'Refresh compare-and-swap must have one winner',
    );
    await bounded(events.waitUntilReady());
    await bounded(worker.waitUntilReady());
    const job = await queue.add('round-trip', { value: 21 });
    assert.equal(await job.waitUntilFinished(events, 15000), 42);
    await storage.put(storageKey, Buffer.from('isolated core test'), 'text/plain');
    uploaded = true;
    assert.equal((await storage.get(storageKey)).toString(), 'isolated core test');
    await storage.remove(storageKey);
    uploaded = false;
    await assert.rejects(storage.get(storageKey), (error) => error.name === 'NoSuchKey');
    console.log(
      'Real infrastructure passed: PostgreSQL concurrent refresh CAS, BullMQ/Valkey worker, S3 upload/read/delete.',
    );
  } finally {
    if (uploaded) await storage.remove(storageKey);
    storage.onModuleDestroy();
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
    await worker.close(true);
    await events.close();
    // Only this run's unique prefix is removed, never a shared application's queue.
    try {
      await bounded(queue.obliterate({ force: true }));
    } finally {
      await queue.close();
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

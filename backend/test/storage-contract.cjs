// Exercise the real AWS SDK against a private loopback fixture; no external storage used.
const http = require('node:http');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const { StorageService } = require('../dist/files/storage.service');
(async () => {
  const contents = new Map();
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const key = new URL(req.url, 'http://localhost').pathname;
    requests.push({ method: req.method, key, signed: !!req.headers.authorization });
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      contents.set(key, Buffer.concat(chunks));
      res.end();
    } else if (req.method === 'GET') {
      const body = contents.get(key);
      if (!body) {
        res.statusCode = 404;
        res.end();
      } else res.end(body);
    } else if (req.method === 'DELETE') {
      contents.delete(key);
      res.statusCode = 204;
      res.end();
    } else {
      res.statusCode = 405;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const storage = new StorageService(
    new ConfigService({
      S3_ENDPOINT: `http://127.0.0.1:${server.address().port}`,
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'test-private',
      S3_ACCESS_KEY: 'fixture',
      S3_SECRET_KEY: 'fixture-only',
      S3_FORCE_PATH_STYLE: 'true',
    }),
  );
  try {
    await storage.put('files/test', Buffer.from('stored content'), 'text/plain');
    assert.equal((await storage.get('files/test')).toString(), 'stored content');
    await storage.remove('files/test');
    assert.equal(contents.size, 0);
    assert(requests.every((r) => r.signed && r.key === '/test-private/files/test'));
    console.log(
      'S3 transport contract passed: signed path-style upload, read and compensating delete.',
    );
  } finally {
    storage.onModuleDestroy();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

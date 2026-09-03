// Executes the real migration SQL in isolated PostgreSQL (PGlite); never opens DATABASE_URL.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  try {
    const root = path.join(__dirname, '../prisma/migrations');
    for (const name of fs.readdirSync(root).sort()) {
      const file = path.join(root, name, 'migration.sql');
      if (fs.existsSync(file)) await db.exec(fs.readFileSync(file, 'utf8'));
    }
    const uid = '11111111-1111-4111-8111-111111111111';
    const cid = '22222222-2222-4222-8222-222222222222';
    const tid = '33333333-3333-4333-8333-333333333333';
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "TaskStatus"')).rows[0].n, 5);
    await db.query(
      'INSERT INTO "User" (id,email,"firstName","lastName","passwordHash","updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
      [uid, 'test@example.invalid', 'Test', 'User', 'test-only'],
    );
    await db.query(
      'INSERT INTO "Client" (id,type,name,"responsibleUserId","updatedAt") VALUES ($1,$2,$3,$4,now())',
      [cid, 'LEGAL_ENTITY', 'Test', uid],
    );
    await assert.rejects(db.query('DELETE FROM "User" WHERE id=$1', [uid]), /foreign key/);
    await assert.rejects(
      db.query(
        'INSERT INTO "Client" (id,type,name,"responsibleUserId","updatedAt") VALUES ($1,$2,$3,$4,now())',
        [tid, 'LEGAL_ENTITY', 'Orphan', tid],
      ),
      /foreign key/,
    );
    await db.query(
      'INSERT INTO "Task" (id,title,"authorId","assigneeId","clientId","originalDeadline",deadline,"updatedAt") VALUES ($1,$2,$3,$3,$4,now(),now(),now())',
      [tid, 'Next step', uid, cid],
    );
    await assert.rejects(
      db.query('UPDATE "Task" SET status=$1 WHERE id=$2', ['UNDEFINED', tid]),
      /foreign key/,
    );
    await db.query('INSERT INTO "TaskStatus" (code,name) VALUES ($1,$2)', ['WAITING', 'Waiting']);
    await db.query('UPDATE "Task" SET status=$1 WHERE id=$2', ['WAITING', tid]);
    await assert.rejects(
      db.query('INSERT INTO "Activity" (id,"clientId",type,summary) VALUES ($1,$2,$3,$4)', [
        uid,
        cid,
        'NOTE',
        'Missing actual date',
      ]),
      /null value/,
    );
    await db.query(
      'INSERT INTO "Activity" (id,"clientId",type,summary,"occurredAt") VALUES ($1,$2,$3,$4,$5)',
      [uid, cid, 'NOTE', 'Imported event', '2020-01-01T00:00:00Z'],
    );
    assert.equal(
      (
        await db.query(
          'SELECT "occurredAt" < "createdAt" AS historical FROM "Activity" WHERE id=$1',
          [uid],
        )
      ).rows[0].historical,
      true,
    );
    await db.query(
      'INSERT INTO "ObjectPermission" (id,"userId","objectType","objectId",permission) VALUES ($1,$1,$2,$3,$4)',
      [uid, 'CLIENT', cid, 'client.read'],
    );
    assert.equal((await db.query('SELECT effect FROM "ObjectPermission"')).rows[0].effect, 'DENY');
    console.log(
      'Migration checks passed: schema creation, 5 default statuses, configurable status, User foreign keys, restricted deletion, required historical occurredAt, default DENY.',
    );
  } finally {
    await db.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

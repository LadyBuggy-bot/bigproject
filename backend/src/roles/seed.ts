import { PrismaClient } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import { SYSTEM_ROLES } from './roles.service';

const coreCodes = [
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
  'notification.manage',
];
const crmCodes = [
  'client.read',
  'client.create',
  'client.update',
  'client.delete',
  'client.export',
  'client.merge',
  'contact.read',
  'contact.create',
  'contact.update',
  'contact.delete',
  'deal.read',
  'deal.create',
  'deal.update',
  'deal.delete',
  'deal.change_stage',
  'deal.export',
  'pipeline.read',
  'pipeline.manage',
  'deal.field.amount.read',
];
const taskCodes = [
  'task.read',
  'task.create',
  'task.update',
  'task.delete',
  'task.assign',
  'task.change_deadline',
  'task.complete',
  'task.accept',
  'task.return_to_work',
  'task.export',
];
const fileCodes = ['file.read', 'file.upload', 'file.update', 'file.delete', 'file.download'];
const allCodes = [...coreCodes, ...crmCodes, ...taskCodes, ...fileCodes];
const defaults: Record<string, string[]> = {
  OWNER: allCodes,
  ADMIN: allCodes,
  MANAGER: [
    ...crmCodes.filter((code) => !['pipeline.manage', 'client.merge'].includes(code)),
    ...taskCodes,
    ...fileCodes,
  ],
  EMPLOYEE: [
    'task.read',
    'task.create',
    'task.update',
    'task.change_deadline',
    'task.complete',
    ...fileCodes,
  ],
  SALES_MANAGER: [
    ...fileCodes,
    'client.read',
    'client.create',
    'client.update',
    'client.export',
    'contact.read',
    'contact.create',
    'contact.update',
    'deal.read',
    'deal.create',
    'deal.update',
    'deal.change_stage',
    'deal.export',
    'pipeline.read',
    'task.read',
    'task.create',
    'task.update',
    'task.change_deadline',
    'task.complete',
  ],
  OBSERVER: ['task.read', 'client.read', 'deal.read', 'file.read', 'file.download'],
  GUEST: ['task.read', 'file.read', 'file.download'],
};

// Deliberate provisioning command, never executed during application startup.
async function seed() {
  try {
    process.loadEnvFile('../.env');
  } catch {
    /* CI can supply environment directly. */
  }
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const knownCodes = new Set(
        (await tx.permission.findMany({ select: { code: true } })).map((p) => p.code),
      );
      for (const code of allCodes)
        await tx.permission.upsert({ where: { code }, create: { code }, update: {} });
      for (const name of SYSTEM_ROLES) {
        const existing = await tx.role.findUnique({ where: { name } });
        // Reruns must not silently restore revoked permissions or overwrite custom policy.
        if (existing) {
          if (existing.isSystem) {
            const additions = await tx.permission.findMany({
              where: { code: { in: defaults[name].filter((code) => !knownCodes.has(code)) } },
            });
            await tx.rolePermission.createMany({
              data: additions.map((p) => ({ roleId: existing.id, permissionId: p.id })),
              skipDuplicates: true,
            });
          }
          continue;
        }
        const permissions = await tx.permission.findMany({
          where: { code: { in: defaults[name] } },
        });
        await tx.role.create({
          data: {
            name,
            isSystem: true,
            permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
          },
        });
      }
      await tx.auditLog.create({ data: { action: 'core.seed', entityType: 'SYSTEM' } });
    });
    const email = process.env.CORE_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    const password = process.env.CORE_BOOTSTRAP_PASSWORD;
    if (email || password) {
      if (!email || !password || password.length < 12)
        throw new Error('Both bootstrap variables required; password minimum 12 characters');
      const passwordHash = await new PasswordService().hash(password);
      await prisma.$transaction(async (tx) => {
        // Serialize bootstrap attempts and refuse privilege escalation of an existing account.
        await tx.$executeRaw`DO $$ BEGIN PERFORM pg_advisory_xact_lock(731001); END $$`;
        if ((await tx.user.count()) !== 0)
          throw new Error('Bootstrap requires an empty User table');
        const role = await tx.role.findUniqueOrThrow({ where: { name: 'OWNER' } });
        const user = await tx.user.create({
          data: {
            email,
            firstName: 'Owner',
            lastName: 'Bootstrap',
            passwordHash,
            roles: { create: { roleId: role.id } },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'core.bootstrap',
            entityType: 'USER',
            entityId: user.id,
          },
        });
      });
    }
    console.log('Core defaults provisioned. Existing role policies were preserved.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module)
  void seed().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

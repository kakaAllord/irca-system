/* eslint-disable no-console -- a script reports to its terminal */
// Local and test data: two churches and a few accounts to sign in with.
//
// Refuses to run anywhere but development and test, because it writes known
// passwords. TEST exists from the start, with records that overlap IRCA's,
// so a leak between churches shows up as a wrong row in a test rather than
// an empty page (docs/plan/multi-tenancy.md, section 15).
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PasswordService } from '../src/core/auth/password.service.js';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import type { PrismaCore } from '../src/core/database/prisma-clients.js';

config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env', quiet: true });

const env = process.env.NODE_ENV;
if (env !== 'development' && env !== 'test') {
  console.error(
    `Refusing to seed with NODE_ENV=${env ?? '(unset)'}: the seed writes known passwords.`,
  );
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL! }),
});
const passwords = new PasswordService();

async function church(code: string, slug: string, name: string) {
  return db.church.upsert({
    where: { code },
    update: { name, slug },
    create: { code, slug, name },
  });
}

async function user(
  email: string,
  fullName: string,
  password: string,
  platformRole: 'NONE' | 'DEV' = 'NONE',
) {
  const passwordHash = await passwords.hash(password);
  return db.user.upsert({
    where: { email },
    update: {
      fullName,
      passwordHash,
      platformRole,
      status: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
    },
    create: { email, fullName, passwordHash, platformRole, status: 'ACTIVE' },
  });
}

/** A portal the church uses. Its built-in roles follow from the sync below. */
async function portal(churchId: string, moduleKey: string) {
  await db.churchModule.upsert({
    where: { churchId_moduleKey: { churchId, moduleKey } },
    update: { enabled: true },
    create: { churchId, moduleKey, enabled: true, enabledAt: new Date() },
  });
}

async function member(churchId: string, userId: string, systemRoleKeys: string[] = []) {
  const membership = await db.churchMembership.upsert({
    where: { churchId_userId: { churchId, userId } },
    update: { status: 'ACTIVE' },
    create: { churchId, userId, status: 'ACTIVE', joinedAt: new Date() },
  });
  // The roles themselves come from the module definitions, written by the
  // same sync the API runs at boot (called below), so a fresh database can be
  // seeded without starting the API first.
  for (const systemKey of systemRoleKeys) {
    const role = await db.role.findUnique({
      where: { churchId_systemKey: { churchId, systemKey } },
    });
    if (!role) {
      console.warn(`no role ${systemKey} in this church: is its portal on?`);
      continue;
    }
    await db.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
      update: {},
      create: { churchId, membershipId: membership.id, roleId: role.id },
    });
  }
  return membership;
}

const irca = await church('IRCA', 'irca', 'International Revival Church Arusha');
const test = await church('TEST', 'test', 'Test Church');

// IRCA runs Finance; TEST does not, so a test can prove a portal that is off
// is off, and that the two churches number their entries independently.
await portal(irca.id, 'finance');
await portal(irca.id, 'membership');

// The permissions and built-in roles the code defines, written before anyone
// is given one.
await new RegistrySync(db as unknown as PrismaCore).sync();

await user('dev@irca.local', 'Dev Account', 'dev-password-123', 'DEV');
await member(irca.id, (await user('admin@irca.local', 'IRCA Admin', 'admin-password-123')).id, [
  'admin.administrator',
]);
// A second administrator, because nobody decides their own change request,
// and the pastor who decides membership applications.
await member(irca.id, (await user('pastor@irca.local', 'Pastor Sarah', 'pastor-password-123')).id, [
  'admin.administrator',
  'membership.pastor',
]);
// The office, and the follow-up team, who must not read prayer requests.
await member(irca.id, (await user('office@irca.local', 'Grace Office', 'office-password-123')).id, [
  'membership.secretary',
]);
await member(
  irca.id,
  (await user('followup@irca.local', 'Daniel Followup', 'followup-password-123')).id,
  ['membership.followup'],
);
await member(irca.id, (await user('clerk@irca.local', 'Neema Mollel', 'clerk-password-123')).id, [
  'finance.clerk',
]);
await member(
  irca.id,
  (await user('mhazini@irca.local', 'Joyce Mhazini', 'manager-password-123')).id,
  ['finance.manager'],
);
await member(test.id, (await user('admin@test.local', 'Test Admin', 'admin-password-123')).id, [
  'admin.administrator',
]);

console.log(
  'seeded: IRCA (with Membership and Finance) and TEST, with dev@, admin@, pastor@, office@, followup@, clerk@ and mhazini@irca.local, admin@test.local',
);
await db.$disconnect();

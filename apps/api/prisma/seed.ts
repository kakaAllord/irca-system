/* eslint-disable no-console -- a script reports to its terminal */
// Local and test data: the church, and a few accounts to sign in with.
//
// Refuses to run anywhere but development and test, because it writes known
// passwords.
import { createHash } from 'node:crypto';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PasswordService } from '../src/core/auth/password.service.js';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import type { PrismaDb } from '../src/core/database/prisma-clients.js';

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

async function user(email: string, fullName: string, password: string, roleKeys: string[] = []) {
  const passwordHash = await passwords.hash(password);
  const person = await db.user.upsert({
    where: { email },
    update: {
      fullName,
      passwordHash,
      status: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
    },
    create: { email, fullName, passwordHash, status: 'ACTIVE' },
  });
  // The roles themselves come from the module definitions, written by the same
  // sync the API runs at boot (called below), so a fresh database can be seeded
  // without starting the API first.
  for (const systemKey of roleKeys) {
    const role = await db.role.findUnique({ where: { systemKey } });
    if (!role) {
      console.warn(`no role ${systemKey}: is its portal on?`);
      continue;
    }
    await db.userRole.upsert({
      where: { userId_roleId: { userId: person.id, roleId: role.id } },
      update: {},
      create: { userId: person.id, roleId: role.id },
    });
  }
  return person;
}

/** A portal this church uses. */
async function portal(moduleKey: string) {
  await db.moduleState.upsert({
    where: { moduleKey },
    update: { enabled: true },
    create: { moduleKey, enabled: true, enabledAt: new Date() },
  });
}

// The one church. A check constraint in the migration keeps it the only one.
await db.church.upsert({
  where: { id: 1 },
  update: {},
  create: { id: 1, code: 'IRCA', name: 'International Revival Church Arusha' },
});

/**
 * A department, and the portal that belongs to it (D28): a department portal
 * is only switched on for the department it belongs to.
 */
async function department(name: string, description: string, moduleKey: string | null = null) {
  await db.department.upsert({
    where: { name },
    update: { moduleKey },
    create: { name, description, moduleKey },
  });
  if (moduleKey) await portal(moduleKey);
}

await department(
  'Membership',
  'Visitors, members and the foundation class: the office and the follow-up team.',
  'membership',
);
await department('Finance', 'Income and expenses, and the reports the church reads.', 'finance');
await department(
  'Communications',
  'The messages the church sends, and the standards they follow.',
  'comms',
);
await portal('admin');
await portal('dev');

// The permissions and built-in roles the code defines, written before anyone
// is given one.
await new RegistrySync(db as unknown as PrismaDb).sync();

// The developer is this church's developer: an ordinary role, not a rank above.
await user('dev@irca.local', 'Dev Account', 'dev-password-123', [
  'admin.administrator',
  'dev.developer',
]);
await user('admin@irca.local', 'IRCA Admin', 'admin-password-123', ['admin.administrator']);
// A second administrator, because nobody decides their own change request,
// and the pastor who decides membership applications.
await user('pastor@irca.local', 'Pastor Sarah', 'pastor-password-123', [
  'admin.administrator',
  'membership.pastor',
]);
// The office, and the follow-up team, who must not read prayer requests.
await user('office@irca.local', 'Grace Office', 'office-password-123', ['membership.secretary']);
await user('followup@irca.local', 'Daniel Followup', 'followup-password-123', [
  'membership.followup',
]);
await user('clerk@irca.local', 'Neema Mollel', 'clerk-password-123', ['finance.clerk']);
await user('mhazini@irca.local', 'Joyce Mhazini', 'manager-password-123', ['finance.manager']);
// Communications is led by Allord Archard (comms brief, 24 Sept 2026); locally,
// someone holding that role to sign in as.
await user('comms@irca.local', 'Allord Archard', 'comms-password-123', ['comms.lead']);

// The registration form's key, for development and the browser tests. A known
// value only because this seed refuses to run anywhere else: production keys
// come from `api-client:create` and are never written down.
const LOCAL_FORM_KEY = 'irk_local_registration_form_key_not_for_production';
const keyHash = createHash('sha256').update(LOCAL_FORM_KEY).digest('hex');
await db.apiClient.upsert({
  where: { keyHash },
  update: { revokedAt: null },
  create: {
    name: 'Registration form (local)',
    kind: 'REGISTRATION',
    keyPrefix: LOCAL_FORM_KEY.slice(0, 12),
    keyHash,
  },
});

console.log(
  'seeded IRCA, with dev@, admin@, pastor@, office@, followup@, clerk@, mhazini@ and comms@irca.local',
);
await db.$disconnect();

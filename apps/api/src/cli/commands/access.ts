import { normalizeEmail } from '@irca/shared';
import type { PrismaDb } from '../../core/database/prisma-clients.js';
import { insertAuditEvent } from '../../core/audit/audit.service.js';
import type { SessionService } from '../../core/auth/session.service.js';

/**
 * The commands a dev runs on the API host when the portal cannot help: nobody
 * is set up yet, the only administrator is locked out, or someone must lose
 * access this minute. Each writes to the activity log as the command line,
 * since there is no signed-in person to name, and says so in the line, so
 * the church can see that it happened and that it was not done in the portal.
 */

const BY_HAND = { via: 'command line' };

/** The church's one row of settings. Only ever created once. */
export async function setupChurch(options: {
  db: PrismaDb;
  code: string;
  name: string;
  timezone?: string;
  currency?: string;
}) {
  const { db } = options;
  const existing = await db.church.findUnique({ where: { id: 1 } });
  if (existing) {
    throw new Error(
      `This database already belongs to ${existing.name} (${existing.code}). ` +
        'Change its settings in the dev console instead.',
    );
  }
  const code = options.code.trim().toUpperCase();
  if (!/^[A-Z]{2,10}$/.test(code)) {
    throw new Error('The code is 2 to 10 letters, like IRCA. It is printed on every entry.');
  }
  const timezone = options.timezone ?? 'Africa/Dar_es_Salaam';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new Error(`${timezone} is not a timezone. Use a name like Africa/Dar_es_Salaam.`);
  }
  const currency = (options.currency ?? 'TZS').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error('The currency is a three-letter code, like TZS.');

  const church = await db.church.create({
    data: { id: 1, code, name: options.name.trim(), timezone, currency },
  });
  await insertAuditEvent(db, {
    source: 'feature',
    action: 'church.created',
    entityType: 'church',
    entityId: '1',
    summary: `Set up ${church.name} (${church.code}) from the command line`,
    meta: BY_HAND,
  });
  return church;
}

async function userByEmail(db: PrismaDb, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Nobody has an account as ${email}.`);
  return user;
}

/**
 * Gives someone a built-in role by its key (`admin.administrator`).
 *
 * The last resort when the only administrator has lost access and a reset
 * email cannot reach them. Custom roles are left to the portal: they have no
 * stable key to type, and needing one in an emergency means something else
 * has gone wrong.
 */
export async function grantRole(options: { db: PrismaDb; email: string; roleKey: string }) {
  const { db } = options;
  const user = await userByEmail(db, options.email);
  if (user.status === 'DISABLED') {
    throw new Error(`${user.email} is disabled. Enable them in the portal first, or ask why.`);
  }
  const role = await db.role.findUnique({ where: { systemKey: options.roleKey } });
  if (!role || role.deletedAt) {
    const keys = await db.role.findMany({
      where: { systemKey: { not: null }, deletedAt: null },
      select: { systemKey: true },
      orderBy: { systemKey: 'asc' },
    });
    throw new Error(
      `No built-in role ${options.roleKey}. There are: ${keys.map((k) => k.systemKey).join(', ')}.`,
    );
  }
  const held = await db.userRole.findUnique({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
  });
  if (held) return { user, role, granted: false };

  await db.$transaction(async (tx) => {
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await insertAuditEvent(tx, {
      source: 'feature',
      action: 'admin.role.granted',
      entityType: 'user',
      entityId: user.id,
      summary: `Gave ${user.fullName} the ${role.name} role from the command line`,
      meta: BY_HAND,
    });
  });
  return { user, role, granted: true };
}

/**
 * Signs someone out of every browser now, and stops anyone viewing as them.
 * It does not disable them: they can sign in again with their password, which
 * is why the runbook pairs it with disabling them, or with a reset.
 */
export async function revokeSessions(options: {
  db: PrismaDb;
  sessions: SessionService;
  email: string;
}) {
  const { db } = options;
  const user = await userByEmail(db, options.email);
  const open = await db.session.count({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  await options.sessions.revokeAllFor(user.id, 'revoked from the command line');
  await insertAuditEvent(db, {
    source: 'feature',
    action: 'admin.user.signed_out',
    entityType: 'user',
    entityId: user.id,
    summary: `Signed ${user.fullName} out everywhere from the command line`,
    meta: BY_HAND,
  });
  return { user, open };
}

/**
 * Whether a reset email can be sent to this address, and why not if it
 * cannot. The reset itself goes through the same service as "Forgot
 * password", so the link, its lifetime and its email are the ones people
 * already know; that service says nothing about why it did not send, which is
 * right for a stranger and useless to a dev.
 */
export async function checkResettable(db: PrismaDb, email: string) {
  const user = await userByEmail(db, email);
  if (user.status === 'INVITED') {
    throw new Error(
      `${user.email} has not accepted their invitation yet. Resend it from People instead.`,
    );
  }
  if (user.status === 'DISABLED') {
    throw new Error(`${user.email} is disabled, so no reset email is sent.`);
  }
  return user;
}

/** The roles a dev holds: the console, and administrator so they can set the rest up. */
export const DEV_ROLE_KEYS = ['dev.developer', 'admin.administrator'] as const;

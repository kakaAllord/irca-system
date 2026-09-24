import { Injectable } from '@nestjs/common';
import { ErrorCode, initialsOf } from '@irca/shared';
import { Db } from '../../core/database/db.service.js';
import { AppError } from '../../core/http/app-error.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { SessionService } from '../../core/auth/session.service.js';
import { ImpersonationService } from '../../core/impersonation/impersonation.service.js';

export type PersonRow = {
  userId: string;
  fullName: string;
  email: string;
  initials: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  roles: { id: string; name: string; moduleKey: string }[];
  lastActiveAt: string | null;
  invitation: { expiresAt: string; expired: boolean; sentCount: number } | null;
  isYou: boolean;
  canImpersonate: boolean;
};

export type PeopleQuery = {
  q?: string;
  status?: 'ACTIVE' | 'INVITED' | 'DISABLED';
  roleId?: string;
  page: number;
  pageSize: number;
};

/**
 * Who has access to this church, and changing it.
 *
 * Reads go through Db, so they are scoped to the church twice over. Anything
 * that writes a person's account (inviting, disabling) is core's work, because
 * accounts are shared between churches and feature code may not write them.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly impersonation: ImpersonationService,
    private readonly usage: UsageService,
  ) {}

  async list(query: PeopleQuery): Promise<{ rows: PersonRow[]; total: number }> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.roleId ? { roles: { some: { roleId: query.roleId } } } : {}),
      ...(query.q
        ? {
            user: {
              OR: [
                { fullName: { contains: query.q, mode: 'insensitive' as const } },
                { email: { contains: query.q, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [people, total] = await Promise.all([
      this.db.client.user.findMany({
        where,
        include: {
          roles: { include: { role: true }, where: { role: { deletedAt: null } } },
          invitations: {
            where: { acceptedAt: null, revokedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { fullName: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.user.count({ where }),
    ]);

    const lastSeen = await this.sessions.lastSeen(people.map((m) => m.id));
    return {
      total,
      rows: await Promise.all(
        people.map(async (m) => ({
          userId: m.id,
          fullName: m.fullName,
          email: m.email,
          initials: initialsOf(m.fullName),
          status: m.status,
          roles: m.roles.map((r) => ({
            id: r.role.id,
            name: r.role.name,
            moduleKey: r.role.moduleKey,
          })),
          lastActiveAt: lastSeen.get(m.id)?.toISOString() ?? null,
          invitation: m.invitations[0]
            ? {
                expiresAt: m.invitations[0].expiresAt.toISOString(),
                expired: m.invitations[0].expiresAt.getTime() < Date.now(),
                sentCount: m.invitations[0].sentCount,
              }
            : null,
          isYou: m.id === this.auth.actorUserId,
          canImpersonate: await this.canImpersonate(m.id),
        })),
      ),
    };
  }

  async get(userId: string) {
    const person = await this.db.client.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true }, where: { role: { deletedAt: null } } },
        invitations: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!person) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person here.');
    // Never impersonation (D16): church_audit_events() cannot return one of
    // those rows however this is filtered.
    const recent = await this.db.client.$queryRaw<
      { createdAt: Date; action: string; summary: string | null }[]
    >`
      select "createdAt", action, summary
      from church_audit_events()
      where "actorUserId" = ${userId}
      order by "createdAt" desc
      limit 10
    `;

    return {
      userId,
      fullName: person.fullName,
      email: person.email,
      phone: person.phone,
      initials: initialsOf(person.fullName),
      status: person.status,
      joinedAt: person.createdAt.toISOString(),
      lastLoginAt: person.lastLoginAt?.toISOString() ?? null,
      roles: person.roles.map((r) => ({
        id: r.role.id,
        name: r.role.name,
        moduleKey: r.role.moduleKey,
      })),
      invitation: person.invitations[0]
        ? {
            expiresAt: person.invitations[0].expiresAt.toISOString(),
            expired: person.invitations[0].expiresAt.getTime() < Date.now(),
            sentCount: person.invitations[0].sentCount,
            accepted: person.invitations[0].acceptedAt !== null,
          }
        : null,
      isYou: userId === this.auth.actorUserId,
      canImpersonate: await this.canImpersonate(userId),
      // Deliberately no view-as history: the person viewed is never told, and
      // a church cannot look it up either (D16).
      recentActivity: recent.map((e) => ({
        at: e.createdAt.toISOString(),
        action: e.action,
        summary: e.summary,
      })),
    };
  }

  /** The roles someone holds, set to exactly this list. */
  async setRoles(userId: string, roleIds: string[]): Promise<void> {
    const person = await this.db.client.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!person) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person here.');

    const roles = await this.db.client.role.findMany({
      where: { id: { in: roleIds }, deletedAt: null },
    });
    if (roles.length !== roleIds.length) {
      throw new AppError(
        422,
        ErrorCode.ROLE_NOT_AVAILABLE,
        'One of those roles does not exist here.',
      );
    }
    const enabled = new Set(
      (await this.db.client.moduleState.findMany({ where: { enabled: true } })).map(
        (m) => m.moduleKey,
      ),
    );
    const off = roles.find((r) => !enabled.has(r.moduleKey));
    if (off) {
      throw new AppError(
        422,
        ErrorCode.ROLE_NOT_AVAILABLE,
        `The ${off.moduleKey} portal is turned off.`,
      );
    }

    const had = new Set(person.roles.map((r) => r.roleId));
    const want = new Set(roleIds);
    const removing = person.roles.filter((r) => !want.has(r.roleId));
    const adding = roles.filter((r) => !had.has(r.id)).length;
    if (adding + removing.length) this.usage.inc('admin.role_changes', adding + removing.length);
    if (removing.some((r) => r.role.systemKey === 'admin.administrator')) {
      await this.guardLastAdministrator(userId);
    }

    await this.db.tx(async (tx) => {
      for (const role of roles.filter((r) => !had.has(r.id))) {
        await tx.userRole.create({
          data: {
            userId: person.id,
            roleId: role.id,
            grantedById: this.auth.actorUserId,
          },
        });
        await this.audit.recordIn(tx, {
          action: 'admin.role.granted',
          entityType: 'user',
          entityId: userId,
          summary: `Gave ${person.fullName} the ${role.name} role`,
        });
      }
      for (const link of removing) {
        await tx.userRole.delete({
          where: { userId_roleId: { userId: person.id, roleId: link.roleId } },
        });
        await this.audit.recordIn(tx, {
          action: 'admin.role.revoked',
          entityType: 'user',
          entityId: userId,
          summary: `Took the ${link.role.name} role from ${person.fullName}`,
        });
      }
    });
  }

  async setEnabled(userId: string, enabled: boolean): Promise<void> {
    if (userId === this.auth.actorUserId && !enabled) {
      throw new AppError(409, ErrorCode.CONFLICT, "You can't disable your own access.");
    }
    const person = await this.db.client.user.findUnique({ where: { id: userId } });
    if (!person) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person here.');
    if (!enabled) await this.guardLastAdministrator(userId);

    await this.db.tx(async (tx) => {
      await tx.user.update({
        where: { id: person.id },
        data: { status: enabled ? 'ACTIVE' : 'DISABLED' },
      });
      await this.audit.recordIn(tx, {
        action: enabled ? 'admin.user.enabled' : 'admin.user.disabled',
        entityType: 'user',
        entityId: userId,
        summary: `${enabled ? 'Restored' : 'Disabled'} access for ${person.fullName}`,
      });
    });

    if (!enabled) {
      // Signed out at once, and out of any view-as of them.
      await this.sessions.revokeAllFor(userId, 'disabled');
    }
  }

  private async guardLastAdministrator(userId: string): Promise<void> {
    const admins = await this.db.client.userRole.findMany({
      where: { role: { systemKey: 'admin.administrator', deletedAt: null } },
      include: { user: true },
    });
    const others = admins.filter((a) => a.userId !== userId && a.user.status === 'ACTIVE');
    if (admins.some((a) => a.userId === userId) && others.length === 0) {
      throw new AppError(
        409,
        ErrorCode.LAST_ADMIN,
        'This church needs at least one administrator. Make someone else an administrator first.',
      );
    }
  }

  private canImpersonate(subjectUserId: string): Promise<boolean> {
    return this.impersonation.canImpersonate(subjectUserId);
  }
}

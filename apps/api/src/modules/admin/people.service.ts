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

    const [memberships, total] = await Promise.all([
      this.db.client.churchMembership.findMany({
        where,
        include: {
          user: true,
          roles: { include: { role: true }, where: { role: { deletedAt: null } } },
          invitations: {
            where: { acceptedAt: null, revokedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { user: { fullName: 'asc' } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.churchMembership.count({ where }),
    ]);

    const lastSeen = await this.sessions.lastSeenInChurch(
      memberships.map((m) => m.userId),
    );
    return {
      total,
      rows: await Promise.all(
        memberships.map(async (m) => ({
          userId: m.userId,
          fullName: m.user.fullName,
          email: m.user.email,
          initials: initialsOf(m.user.fullName),
          status: m.status,
          roles: m.roles.map((r) => ({
            id: r.role.id,
            name: r.role.name,
            moduleKey: r.role.moduleKey,
          })),
          lastActiveAt: lastSeen.get(m.userId)?.toISOString() ?? null,
          invitation: m.invitations[0]
            ? {
                expiresAt: m.invitations[0].expiresAt.toISOString(),
                expired: m.invitations[0].expiresAt.getTime() < Date.now(),
                sentCount: m.invitations[0].sentCount,
              }
            : null,
          isYou: m.userId === this.auth.actorUserId,
          canImpersonate: await this.canImpersonate(m.userId),
        })),
      ),
    };
  }

  async get(userId: string) {
    const membership = await this.db.client.churchMembership.findUnique({
      where: { userId },
      include: {
        user: true,
        roles: { include: { role: true }, where: { role: { deletedAt: null } } },
        invitations: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!membership) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person here.');

    const invitedBy = membership.invitedById
      ? await this.db.client.user.findUnique({ where: { id: membership.invitedById } })
      : null;
    const recent = await this.db.client.auditEvent.findMany({
      where: { actorUserId: userId, impersonationId: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      userId,
      fullName: membership.user.fullName,
      email: membership.user.email,
      phone: membership.user.phone,
      initials: initialsOf(membership.user.fullName),
      status: membership.status,
      joinedAt: membership.joinedAt?.toISOString() ?? null,
      invitedBy: invitedBy?.fullName ?? null,
      lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
      roles: membership.roles.map((r) => ({
        id: r.role.id,
        name: r.role.name,
        moduleKey: r.role.moduleKey,
      })),
      invitation: membership.invitations[0]
        ? {
            expiresAt: membership.invitations[0].expiresAt.toISOString(),
            expired: membership.invitations[0].expiresAt.getTime() < Date.now(),
            sentCount: membership.invitations[0].sentCount,
            accepted: membership.invitations[0].acceptedAt !== null,
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
    const membership = await this.db.client.churchMembership.findUnique({
      where: { userId },
      include: { roles: { include: { role: true } }, user: true },
    });
    if (!membership) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person here.');

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
      (await this.db.client.churchModule.findMany({ where: { enabled: true } })).map(
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

    const had = new Set(membership.roles.map((r) => r.roleId));
    const want = new Set(roleIds);
    const removing = membership.roles.filter((r) => !want.has(r.roleId));
    const adding = roles.filter((r) => !had.has(r.id)).length;
    if (adding + removing.length) this.usage.inc('admin.role_changes', adding + removing.length);
    if (removing.some((r) => r.role.systemKey === 'admin.administrator')) {
      await this.guardLastAdministrator(userId);
    }

    await this.db.tx(async (tx) => {
      for (const role of roles.filter((r) => !had.has(r.id))) {
        await tx.membershipRole.create({
          data: {
            membershipId: membership.id,
            roleId: role.id,
            grantedById: this.auth.actorUserId,
          },
        });
        await this.audit.recordIn(tx, {
          action: 'admin.role.granted',
          entityType: 'user',
          entityId: userId,
          summary: `Gave ${membership.user.fullName} the ${role.name} role`,
        });
      }
      for (const link of removing) {
        await tx.membershipRole.delete({
          where: { membershipId_roleId: { membershipId: membership.id, roleId: link.roleId } },
        });
        await this.audit.recordIn(tx, {
          action: 'admin.role.revoked',
          entityType: 'user',
          entityId: userId,
          summary: `Took the ${link.role.name} role from ${membership.user.fullName}`,
        });
      }
    });
  }

  async setEnabled(userId: string, enabled: boolean): Promise<void> {
    if (userId === this.auth.actorUserId && !enabled) {
      throw new AppError(409, ErrorCode.CONFLICT, "You can't disable your own access.");
    }
    const membership = await this.db.client.churchMembership.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!membership) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person here.');
    if (!enabled) await this.guardLastAdministrator(userId);

    await this.db.tx(async (tx) => {
      await tx.churchMembership.update({
        where: { id: membership.id },
        data: { status: enabled ? 'ACTIVE' : 'DISABLED' },
      });
      await this.audit.recordIn(tx, {
        action: enabled ? 'admin.user.enabled' : 'admin.user.disabled',
        entityType: 'user',
        entityId: userId,
        summary: `${enabled ? 'Restored' : 'Disabled'} access for ${membership.user.fullName}`,
      });
    });

    if (!enabled) {
      // Out of this church at once, and out of any view-as of them.
      await this.sessions.revokeForChurch(userId, 'access-disabled');
    }
  }

  /** A church must always keep someone who can give access to others. */
  private async guardLastAdministrator(churchId: string, userId: string): Promise<void> {
    const admins = await this.db.client.membershipRole.findMany({
      where: {
        role: { systemKey: 'admin.administrator', deletedAt: null },
        membership: { status: 'ACTIVE' },
      },
      include: { membership: true },
    });
    const others = admins.filter((a) => a.membership.userId !== userId);
    if (admins.some((a) => a.membership.userId === userId) && others.length === 0) {
      throw new AppError(
        409,
        ErrorCode.LAST_ADMIN,
        'This church needs at least one administrator. Make someone else an administrator first.',
      );
    }
  }

  private canImpersonate(churchId: string, subjectUserId: string): Promise<boolean> {
    return this.impersonation.canImpersonate(subjectUserId);
  }
}

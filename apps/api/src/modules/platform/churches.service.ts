import { Injectable } from '@nestjs/common';
import { ErrorCode, initialsOf, normalizeEmail } from '@irca/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaCore } from '../../core/database/prisma-clients.js';
import { AppError } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { RegistrySync } from '../../core/rbac/registry-sync.service.js';
import { InvitationService } from '../../core/invitations/invitation.service.js';
import { ApiClientService } from '../../core/clients/api-client.service.js';
import { ImpersonationService } from '../../core/impersonation/impersonation.service.js';

/** The figures the church list shows, summed over a window. */
const SUMS = [
  'api.requests',
  'api.errors.5xx',
  'auth.logins',
  'email.sent',
  'registrations.started',
  'finance.transactions.created',
] as const;

export type NewChurch = {
  code: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  adminName: string;
  adminEmail: string;
};

/**
 * Every church, as the platform team sees it.
 *
 * This is the one feature module that reads across churches, through the core
 * connection, because that is its whole job. It never writes a church's own
 * records: creating a church, pausing it and managing its keys are the only
 * changes it makes, and each is written to the church's log as well.
 */
@Injectable()
export class ChurchesService {
  constructor(
    private readonly db: PrismaCore,
    private readonly audit: AuditService,
    private readonly registry: RegistrySync,
    private readonly invitations: InvitationService,
    private readonly clients: ApiClientService,
    private readonly impersonation: ImpersonationService,
  ) {}

  async list(days: number) {
    const churches = await this.db.church.findMany({ orderBy: { name: 'asc' } });
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const sums = await this.db.$queryRaw<{ church_id: string; metric: string; total: bigint }[]>`
      select church_id, metric, sum(value)::bigint as total from usage_daily
      where day >= ${since}::date and metric in (${Prisma.join([...SUMS])})
      group by church_id, metric`;
    const gauges = await this.db.$queryRaw<{ church_id: string; metric: string; value: bigint }[]>`
      select distinct on (church_id, metric) church_id, metric, value from usage_daily
      where metric in ('db.bytes.total', 'db.share_pct')
      order by church_id, metric, day desc`;
    const active = await this.db.$queryRaw<{ church_id: string; users: bigint }[]>`
      select church_id, count(distinct user_id)::bigint as users from user_activity_daily
      where day >= ${since}::date group by church_id`;
    const people = await this.db.churchMembership.groupBy({
      by: ['churchId', 'status'],
      _count: { _all: true },
    });
    const modules = await this.db.churchModule.groupBy({
      by: ['churchId'],
      where: { enabled: true },
      _count: { _all: true },
    });
    const last = await this.db.$queryRaw<{ church_id: string; at: Date }[]>`
      select active_church_id as church_id, max(last_seen_at) as at from sessions
      where active_church_id is not null group by 1`;
    const trend = await this.db.$queryRaw<{ church_id: string; day: Date; value: bigint }[]>`
      select church_id, day, value from usage_daily
      where metric = 'api.requests' and day >= ${since}::date order by day`;

    return churches.map((c) => {
      const sum = (metric: string) =>
        Number(sums.find((s) => s.church_id === c.id && s.metric === metric)?.total ?? 0);
      const gauge = (metric: string) =>
        Number(gauges.find((g) => g.church_id === c.id && g.metric === metric)?.value ?? 0);
      const count = (status: string) =>
        people.find((p) => p.churchId === c.id && p.status === status)?._count._all ?? 0;
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        people: { active: count('ACTIVE'), invited: count('INVITED') },
        portals: modules.find((m) => m.churchId === c.id)?._count._all ?? 0,
        requests: sum('api.requests'),
        errors: sum('api.errors.5xx'),
        activeUsers: Number(active.find((a) => a.church_id === c.id)?.users ?? 0),
        signIns: sum('auth.logins'),
        emails: sum('email.sent'),
        registrations: sum('registrations.started'),
        entries: sum('finance.transactions.created'),
        dbBytes: gauge('db.bytes.total'),
        dbSharePct: gauge('db.share_pct') / 100,
        lastActiveAt: last.find((l) => l.church_id === c.id)?.at?.toISOString() ?? null,
        requestsByDay: trend
          .filter((t) => t.church_id === c.id)
          .map((t) => ({ day: t.day.toISOString().slice(0, 10), value: Number(t.value) })),
      };
    });
  }

  async get(id: string) {
    const church = await this.require(id);
    const admins = await this.db.membershipRole.findMany({
      where: {
        churchId: id,
        role: { systemKey: 'admin.administrator', deletedAt: null },
        membership: { status: { in: ['ACTIVE', 'INVITED'] } },
      },
      include: { membership: { include: { user: true } } },
    });
    const hasEntries = (await this.db.financeTransaction.count({ where: { churchId: id } })) > 0;
    return {
      id: church.id,
      code: church.code,
      slug: church.slug,
      name: church.name,
      timezone: church.timezone,
      currency: church.currency,
      status: church.status,
      createdAt: church.createdAt.toISOString(),
      // Printed on every finance entry, so it cannot change once there are any.
      codeLocked: hasEntries,
      admins: admins.map((a) => ({
        id: a.membership.user.id,
        fullName: a.membership.user.fullName,
        email: a.membership.user.email,
        status: a.membership.status,
      })),
    };
  }

  /** Everyone with access, with their roles and whether the dev may view as them. */
  async users(id: string) {
    await this.require(id);
    const memberships = await this.db.churchMembership.findMany({
      where: { churchId: id },
      include: {
        user: true,
        roles: { where: { role: { deletedAt: null } }, include: { role: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });
    const lastSeen = await this.db.$queryRaw<{ user_id: string; at: Date }[]>`
      select user_id, max(last_seen_at) as at from sessions where active_church_id = ${id}::uuid
      group by user_id`;
    return Promise.all(
      memberships.map(async (m) => ({
        userId: m.user.id,
        fullName: m.user.fullName,
        initials: initialsOf(m.user.fullName),
        email: m.user.email,
        status: m.status,
        roles: m.roles.map((r) => r.role.name),
        lastActiveAt: lastSeen.find((l) => l.user_id === m.user.id)?.at?.toISOString() ?? null,
        canImpersonate: await this.impersonation.canImpersonate(id, m.user.id),
      })),
    );
  }

  /** The church's own activity log, as its administrators see it. */
  async activity(id: string, before?: string) {
    await this.require(id);
    const rows = await this.db.auditEvent.findMany({
      where: {
        churchId: id,
        source: 'feature',
        impersonationId: null,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const actors = await this.db.user.findMany({
      where: {
        id: { in: [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))] as string[] },
      },
      select: { id: true, fullName: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.fullName]));
    return rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      who: r.actorUserId ? (names.get(r.actorUserId) ?? 'Someone') : 'The system',
      action: r.action,
      summary: r.summary,
    }));
  }

  /**
   * A new church, with the administration portal on, its built-in roles, and
   * its first administrator invited. Their email says the church was set up
   * for them.
   */
  async create(input: NewChurch) {
    const code = input.code.trim().toUpperCase();
    const slug = input.slug.trim().toLowerCase();
    const taken = await this.db.church.findFirst({ where: { OR: [{ code }, { slug }] } });
    if (taken) {
      throw new AppError(409, ErrorCode.ALREADY_EXISTS, 'That code or slug is already a church.', {
        field: taken.code === code ? 'code' : 'slug',
      });
    }

    const church = await this.db.$transaction(async (tx) => {
      const created = await tx.church.create({
        data: {
          code,
          slug,
          name: input.name.trim(),
          timezone: input.timezone,
          currency: input.currency.toUpperCase(),
        },
      });
      await tx.churchPlacement.create({ data: { churchId: created.id } });
      await tx.churchModule.create({
        data: { churchId: created.id, moduleKey: 'admin', enabled: true, enabledAt: new Date() },
      });
      return created;
    });
    await this.registry.syncModuleRoles(church.id, 'admin');

    const role = await this.db.role.findUniqueOrThrow({
      where: { churchId_systemKey: { churchId: church.id, systemKey: 'admin.administrator' } },
    });
    await this.invitations.inviteInto(church.id, {
      email: normalizeEmail(input.adminEmail),
      fullName: input.adminName,
      roleIds: [role.id],
    });

    await this.audit.recordNow({
      action: 'platform.church.created',
      entityType: 'church',
      entityId: church.id,
      summary: `Set up ${church.name} (${church.code}) and invited ${input.adminEmail}`,
      churchId: null,
    });
    return { id: church.id, code: church.code };
  }

  /**
   * Pausing a church: its people lose it at their next request, sign-in to it
   * is refused, and its registration form stops taking answers. Nothing is
   * deleted, and devs can still look. Written to the platform's log and the
   * church's own, because both deserve to know.
   */
  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string): Promise<void> {
    const church = await this.require(id);
    if (church.status === status) return;
    await this.db.church.update({ where: { id }, data: { status } });
    const summary = `${status === 'SUSPENDED' ? 'Paused' : 'Reactivated'} ${church.name}: ${reason}`;
    await this.audit.recordNow({
      action: status === 'SUSPENDED' ? 'platform.church.suspended' : 'platform.church.reactivated',
      entityType: 'church',
      entityId: id,
      summary,
      churchId: null,
    });
    await this.audit.recordNow({
      action: status === 'SUSPENDED' ? 'church.suspended' : 'church.reactivated',
      entityType: 'church',
      entityId: id,
      summary,
      churchId: id,
    });
  }

  async apiClients(id: string) {
    await this.require(id);
    const rows = await this.clients.list(id);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      keyPrefix: c.keyPrefix,
      createdAt: c.createdAt.toISOString(),
      lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
      revokedAt: c.revokedAt?.toISOString() ?? null,
    }));
  }

  /** The key is in the answer once, and nowhere else, ever. */
  async createApiClient(id: string, name: string) {
    const church = await this.require(id);
    const { key, client } = await this.clients.create({ churchId: id, kind: 'REGISTRATION', name });
    await this.audit.recordNow({
      action: 'platform.api_client.created',
      entityType: 'api_client',
      entityId: client.id,
      summary: `Made a registration key "${name}" for ${church.code}`,
      churchId: null,
    });
    return { id: client.id, key };
  }

  async revokeApiClient(id: string, clientId: string): Promise<void> {
    const church = await this.require(id);
    const client = (await this.clients.list(id)).find((c) => c.id === clientId);
    if (!client) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such key for this church.');
    await this.clients.revoke(clientId);
    await this.audit.recordNow({
      action: 'platform.api_client.revoked',
      entityType: 'api_client',
      entityId: clientId,
      summary: `Revoked the key "${client.name}" of ${church.code}`,
      churchId: null,
    });
  }

  private async require(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No such church.');
    const church = await this.db.church.findUnique({ where: { id } });
    if (!church) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such church.');
    return church;
  }
}

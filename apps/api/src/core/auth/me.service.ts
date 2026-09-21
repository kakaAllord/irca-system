import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  CHURCH_MODULES,
  ErrorCode,
  initialsOf,
  platformModule,
  type MeResponse,
} from '@irca/shared';
import { PrismaCore } from '../database/prisma-clients.js';
import type { RequestContext } from '../context/request-context.js';
import { AppError } from '../http/app-error.js';

/**
 * Everything the portal needs to draw itself for the person it is serving.
 *
 * While impersonating, this describes the **subject**: their church, their
 * permissions (read-only ones), their modules and their role labels. Only the
 * impersonation block names the actor, and it is what draws the banner.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly db: PrismaCore,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async build(): Promise<MeResponse> {
    const userId = this.cls.get('userId');
    if (!userId) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please sign in.');

    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const churchId = this.cls.get('churchId');
    const permissions = [...this.cls.get('permissions')].sort();
    const permitted = new Set(permissions);

    const memberships = await this.db.churchMembership.findMany({
      where: { userId, status: 'ACTIVE', church: { status: 'ACTIVE' } },
      include: { church: true },
      orderBy: { church: { name: 'asc' } },
    });
    const church = churchId ? await this.db.church.findUnique({ where: { id: churchId } }) : null;

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        initials: initialsOf(user.fullName),
        platformRole: user.platformRole,
      },
      church: church && {
        id: church.id,
        code: church.code,
        slug: church.slug,
        name: church.name,
        timezone: church.timezone,
        currency: church.currency,
      },
      churches: memberships.map((m) => ({ id: m.church.id, name: m.church.name })),
      permissions,
      modules: await this.modulesFor(churchId, permitted, user.platformRole === 'DEV'),
      roleLabels: await this.roleLabels(userId, churchId),
      impersonation: await this.impersonation(),
    };
  }

  /**
   * The sidebar: modules this church has switched on, with only the pages this
   * person may open. A module with no visible page is left out entirely, and
   * admin comes last. Devs also get the dev console, which belongs to no church.
   */
  private async modulesFor(churchId: string | null, permitted: Set<string>, isDev: boolean) {
    const out: MeResponse['modules'] = [];

    if (isDev) {
      const nav = platformModule.nav.filter((item) => permitted.has(item.permission));
      if (nav.length) {
        out.push({
          key: platformModule.key,
          name: platformModule.name,
          home: platformModule.home,
          nav,
        });
      }
    }

    if (churchId) {
      const enabled = new Set(
        (
          await this.db.churchModule.findMany({
            where: { churchId, enabled: true },
            select: { moduleKey: true },
          })
        ).map((m) => m.moduleKey),
      );
      const ordered = [
        ...CHURCH_MODULES.filter((m) => m.kind !== 'core'),
        ...CHURCH_MODULES.filter((m) => m.kind === 'core'),
      ];
      for (const module of ordered) {
        if (!enabled.has(module.key)) continue;
        const nav = module.nav.filter((item) => permitted.has(item.permission));
        if (nav.length) out.push({ key: module.key, name: module.name, home: module.home, nav });
      }
    }
    return out;
  }

  /** "Church administrator · Finance clerk", for the sidebar's user row. */
  private async roleLabels(userId: string, churchId: string | null): Promise<string[]> {
    if (!churchId) return [];
    const roles = await this.db.membershipRole.findMany({
      where: { membership: { userId, churchId, status: 'ACTIVE' }, role: { deletedAt: null } },
      include: { role: true },
    });
    return roles.map((r) => r.role.name).sort();
  }

  /** The church administrators of the church this person is in. Names only. */
  async administrators(): Promise<{ name: string }[]> {
    const churchId = this.cls.get('churchId');
    if (!churchId) return [];
    const roles = await this.db.membershipRole.findMany({
      where: {
        churchId,
        role: { systemKey: 'admin.administrator', deletedAt: null },
        membership: { status: 'ACTIVE' },
      },
      include: { membership: { include: { user: true } } },
    });
    return roles
      .filter((r) => r.membership.user.status === 'ACTIVE')
      .map((r) => ({ name: r.membership.user.fullName }));
  }

  private async impersonation(): Promise<MeResponse['impersonation']> {
    const id = this.cls.get('impersonationId');
    if (!id) return null;
    const session = await this.db.impersonationSession.findUnique({ where: { id } });
    if (!session) return null;
    const actor = await this.db.user.findUnique({ where: { id: session.actorUserId } });
    return {
      id: session.id,
      actor: { id: session.actorUserId, fullName: actor?.fullName ?? 'Someone' },
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    };
  }
}

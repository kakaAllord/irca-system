import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CHURCH_MODULES, ErrorCode, initialsOf, type MeResponse } from '@irca/shared';
import { PrismaDb } from '../database/prisma-clients.js';
import { ChangeRequestService } from '../change-requests/change-request.service.js';
import type { RequestContext } from '../context/request-context.js';
import { AppError } from '../http/app-error.js';

/**
 * Everything the portal needs to draw itself for the person it is serving.
 *
 * While impersonating, this describes the **subject**: their permissions
 * (read-only ones), their portals and their role labels. Only the
 * impersonation block names the actor, and it is what draws the banner.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly db: PrismaDb,
    private readonly cls: ClsService<RequestContext>,
    private readonly changeRequests: ChangeRequestService,
  ) {}

  async build(): Promise<MeResponse> {
    const userId = this.cls.get('userId');
    if (!userId) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please sign in.');

    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const permissions = [...this.cls.get('permissions')].sort();
    const permitted = new Set(permissions);
    const church = await this.db.church.findFirst();

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        initials: initialsOf(user.fullName),
      },
      church: church && {
        code: church.code,
        name: church.name,
        timezone: church.timezone,
        currency: church.currency,
      },
      permissions,
      modules: await this.modulesFor(permitted),
      badges: await this.badges(permitted),
      roleLabels: await this.roleLabels(userId),
      impersonation: await this.impersonation(),
    };
  }

  /**
   * The sidebar: the portals that are switched on, with only the pages this
   * person may open. A portal with no visible page is left out entirely, and
   * admin and the dev console come last.
   */
  private async modulesFor(permitted: Set<string>) {
    const out: MeResponse['modules'] = [];
    const enabled = new Set(
      (
        await this.db.moduleState.findMany({
          where: { enabled: true },
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
    return out;
  }

  /**
   * What the sidebar shows beside a page. Only requests so far: an
   * administrator should see that something is waiting without opening it.
   */
  private async badges(permitted: Set<string>): Promise<Record<string, number>> {
    if (!permitted.has('admin.requests.read')) return {};
    const pending = await this.changeRequests.pendingCount();
    return pending ? { '/admin/requests': pending } : {};
  }

  /** "Church administrator · Finance clerk", for the sidebar's user row. */
  private async roleLabels(userId: string): Promise<string[]> {
    const roles = await this.db.userRole.findMany({
      where: { userId, role: { deletedAt: null } },
      include: { role: true },
    });
    return roles.map((r) => r.role.name).sort();
  }

  /** The church administrators. Names only. */
  async administrators(): Promise<{ name: string }[]> {
    const roles = await this.db.userRole.findMany({
      where: { role: { systemKey: 'admin.administrator', deletedAt: null } },
      include: { user: true },
    });
    return roles.filter((r) => r.user.status === 'ACTIVE').map((r) => ({ name: r.user.fullName }));
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

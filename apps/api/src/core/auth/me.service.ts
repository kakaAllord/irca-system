import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { initialsOf, type MeResponse } from '@irca/shared';
import { PrismaCore } from '../database/prisma-clients.js';
import type { RequestContext } from '../context/request-context.js';
import { AppError } from '../http/app-error.js';
import { ErrorCode } from '@irca/shared';

/** Builds /me from the request context. Phase 2 adds permissions, modules and impersonation. */
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
    const memberships = await this.db.churchMembership.findMany({
      where: { userId, status: 'ACTIVE', church: { status: 'ACTIVE' } },
      include: { church: true },
      orderBy: { church: { name: 'asc' } },
    });

    const churchId = this.cls.get('churchId');
    const active = churchId
      ? ((await this.db.church.findUnique({ where: { id: churchId } })) ?? null)
      : null;

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        initials: initialsOf(user.fullName),
        platformRole: user.platformRole,
      },
      church: active && {
        id: active.id,
        code: active.code,
        slug: active.slug,
        name: active.name,
        timezone: active.timezone,
        currency: active.currency,
      },
      churches: memberships.map((m) => ({ id: m.church.id, name: m.church.name })),
      permissions: [],
      modules: [],
      roleLabels: [],
      impersonation: null,
    };
  }
}

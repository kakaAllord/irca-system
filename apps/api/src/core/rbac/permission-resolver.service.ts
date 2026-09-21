import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, permissionKind, platformModule } from '@irca/shared';
import { PrismaCore } from '../database/prisma-clients.js';

const IMPERSONATE = ['admin.users.impersonate', 'platform.users.impersonate'];

/**
 * What a request may do, worked out from roles, the church, and which modules
 * that church has switched on.
 *
 * One indexed query per request. There is deliberately no cache: this is a
 * join over a handful of small tables, and a stale permission is a security
 * bug waiting to happen. Add one only if it ever shows in a profile.
 */
@Injectable()
export class PermissionResolver {
  constructor(private readonly db: PrismaCore) {}

  /** Everything a person may do in one church. */
  async forMember(userId: string, churchId: string): Promise<Set<string>> {
    const rows = await this.db.$queryRaw<{ permission_key: string }[]>`
      -- tenant: filtered by m.church_id below; core connection, so RLS does not scope it
      select distinct rp.permission_key
      from church_memberships m
      join membership_roles mr on mr.membership_id = m.id
      join roles r             on r.id = mr.role_id and r.deleted_at is null
      join role_permissions rp on rp.role_id = r.id
      join permissions p       on p.key = rp.permission_key and p.retired_at is null
      join church_modules cm   on cm.church_id = m.church_id
                              and cm.module_key = r.module_key
                              and cm.enabled
      where m.user_id = ${userId}::uuid
        and m.church_id = ${churchId}::uuid
        and m.status = 'ACTIVE'
    `;
    // A permission that no longer exists in code grants nothing.
    return new Set(rows.map((r) => r.permission_key).filter((key) => key in ALL_PERMISSIONS));
  }

  /**
   * Everything a signed-in person may do right now: their roles in the church
   * they are working in, plus the dev console if they are a dev. Used by the
   * session guard and by sign-in, so both answer the same thing.
   */
  async forSignedIn(
    userId: string,
    platformRole: 'NONE' | 'DEV',
    churchId: string | null,
  ): Promise<Set<string>> {
    const own = churchId ? await this.forMember(userId, churchId) : new Set<string>();
    if (platformRole !== 'DEV') return own;
    return new Set([...this.forDev(), ...own]);
  }

  /** A platform dev's own permissions: the dev console, and nothing of any church. */
  forDev(): Set<string> {
    return new Set(Object.keys(platformModule.permissions));
  }

  /**
   * The same permissions with everything that changes anything removed, which
   * is what an impersonated request gets. Starting another impersonation is
   * removed too: no chains of viewing as someone viewing as someone.
   */
  readOnly(permissions: Set<string>): Set<string> {
    return new Set(
      [...permissions].filter(
        (key) => permissionKind(key) === 'read' && !IMPERSONATE.includes(key),
      ),
    );
  }
}

import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, permissionKind } from '@irca/shared';
import { PrismaDb } from '../database/prisma-clients.js';

const IMPERSONATE = ['admin.users.impersonate'];

/**
 * What a request may do, worked out from the person's roles and which portals
 * are switched on.
 *
 * One indexed query per request. There is deliberately no cache: this is a
 * join over a handful of small tables, and a stale permission is a security
 * bug waiting to happen. Add one only if it ever shows in a profile.
 */
@Injectable()
export class PermissionResolver {
  constructor(private readonly db: PrismaDb) {}

  /**
   * Everything a person may do. Used by the session guard and by sign-in, so
   * both answer the same thing.
   *
   * A role of a portal that is switched off grants nothing, which is what
   * makes turning a portal off safe: the roles and the data stay, and come
   * back untouched when it is switched on again.
   */
  async forUser(userId: string): Promise<Set<string>> {
    const rows = await this.db.$queryRaw<{ permission_key: string }[]>`
      select distinct rp.permission_key
      from user_roles ur
      join roles r             on r.id = ur.role_id and r.deleted_at is null
      join role_permissions rp on rp.role_id = r.id
      join permissions p       on p.key = rp.permission_key and p.retired_at is null
      join module_state ms     on ms.module_key = r.module_key and ms.enabled
      join users u             on u.id = ur.user_id
      where ur.user_id = ${userId}::uuid
        and u.status = 'ACTIVE'
    `;
    // A permission that no longer exists in code grants nothing.
    return new Set(rows.map((r) => r.permission_key).filter((key) => key in ALL_PERMISSIONS));
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

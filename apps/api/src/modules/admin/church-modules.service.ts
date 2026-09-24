import { Injectable } from '@nestjs/common';
import { CHURCH_MODULES, ErrorCode, moduleByKey } from '@irca/shared';
import { Db } from '../../core/database/db.service.js';
import { AppError } from '../../core/http/app-error.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { RegistrySync } from '../../core/rbac/registry-sync.service.js';

/**
 * Which portals a church uses.
 *
 * Turning one on creates its built-in roles. Turning one off takes it away
 * from everyone at once but deletes nothing: the roles, who holds them and
 * every record stay, and turning it back on restores the lot. Only portals
 * that exist in the code can be turned on, which is what "they can only be
 * given portals that already exist" means in practice.
 *
 * A department portal exists because a department does (D28): it is switched
 * on only once a department in Admin → Departments has been given it.
 */
@Injectable()
export class ChurchModulesService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly registry: RegistrySync,
  ) {}

  async list() {
    const rows = await this.db.client.moduleState.findMany();
    const state = new Map(rows.map((r) => [r.moduleKey, r]));
    const counts = await this.db.client.userRole.groupBy({
      by: ['roleId'],
      _count: { roleId: true },
    });
    const roles = await this.db.client.role.findMany({ where: { deletedAt: null } });
    const peoplePerModule = new Map<string, number>();
    for (const role of roles) {
      const holders = counts.find((c) => c.roleId === role.id)?._count.roleId ?? 0;
      peoplePerModule.set(role.moduleKey, (peoplePerModule.get(role.moduleKey) ?? 0) + holders);
    }

    const departments = await this.db.client.department.findMany({
      where: { moduleKey: { not: null }, archivedAt: null },
      select: { id: true, name: true, moduleKey: true },
    });
    const departmentOf = new Map(departments.map((d) => [d.moduleKey!, d]));

    return CHURCH_MODULES.map((module) => ({
      key: module.key,
      name: module.name,
      description: module.description,
      kind: module.kind,
      enabled: module.kind === 'core' || (state.get(module.key)?.enabled ?? false),
      peopleWithRoles: peoplePerModule.get(module.key) ?? 0,
      department:
        module.kind === 'core'
          ? null
          : ((departmentOf.get(module.key) && {
              id: departmentOf.get(module.key)!.id,
              name: departmentOf.get(module.key)!.name,
            }) ??
            null),
    }));
  }

  async setEnabled(moduleKey: string, enabled: boolean): Promise<void> {
    const module = moduleByKey(moduleKey);
    if (!module || module.key === 'platform')
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No such portal.');
    if (module.kind === 'core') {
      throw new AppError(409, ErrorCode.CONFLICT, `${module.name} is always on.`);
    }
    if (enabled) {
      const owner = await this.db.client.department.findFirst({
        where: { moduleKey, archivedAt: null },
      });
      if (!owner) {
        throw new AppError(
          409,
          ErrorCode.NEEDS_DEPARTMENT,
          `${module.name} belongs to a department. Give it one in Admin → Departments first.`,
        );
      }
    }

    await this.db.tx(async (tx) => {
      await tx.moduleState.upsert({
        where: { moduleKey },
        update: enabled
          ? { enabled: true, enabledAt: new Date(), enabledById: this.auth.actorUserId }
          : { enabled: false, disabledAt: new Date(), disabledById: this.auth.actorUserId },
        create: {
          moduleKey,
          enabled,
          enabledAt: new Date(),
          enabledById: this.auth.actorUserId,
        },
      });
      await this.audit.recordIn(tx, {
        action: enabled ? 'admin.module.enabled' : 'admin.module.disabled',
        entityType: 'module',
        entityId: moduleKey,
        summary: `Turned ${module.name} ${enabled ? 'on' : 'off'}`,
      });
    });

    // Its built-in roles appear the moment it is turned on.
    if (enabled) await this.registry.syncModuleRoles(moduleKey);
    this.usage.inc('admin.modules.toggled');
  }
}

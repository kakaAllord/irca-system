import { Injectable } from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  CHURCH_MODULES,
  ErrorCode,
  isAssignable,
  moduleByKey,
  permissionsOfModule,
} from '@irca/shared';
import { Db } from '../../core/database/db.service.js';
import { AppError } from '../../core/http/app-error.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AuditService } from '../../core/audit/audit.service.js';

export type RoleInput = {
  moduleKey: string;
  name: string;
  description: string;
  permissionKeys: string[];
};

/**
 * Roles are a church's own words for what people do. The permissions in them
 * come from code, so a church can invent a role but never a power.
 *
 * Roles that came with a portal are kept in step with the code and cannot be
 * edited here, which is why they are marked.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
  ) {}

  /** Every role, grouped by portal, with how many people hold it. */
  async list(assignableOnly = false) {
    const enabled = new Set(
      (await this.db.client.moduleState.findMany({ where: { enabled: true } })).map(
        (m) => m.moduleKey,
      ),
    );
    const roles = await this.db.client.role.findMany({
      where: { deletedAt: null },
      include: { permissions: true, _count: { select: { members: true } } },
      orderBy: [{ moduleKey: 'asc' }, { name: 'asc' }],
    });

    // A portal whose every permission comes from leading a department (My
    // departments) has nothing a role could hold, so it is not listed.
    const withRoles = CHURCH_MODULES.filter((m) => Object.keys(m.permissions).some(isAssignable));
    return withRoles
      .filter((m) => !assignableOnly || enabled.has(m.key))
      .map((module) => ({
        moduleKey: module.key,
        moduleName: module.name,
        enabled: enabled.has(module.key),
        roles: roles
          .filter((r) => r.moduleKey === module.key)
          .map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            isSystem: r.systemKey !== null,
            memberCount: r._count.members,
            permissions: r.permissions.map((p) => p.permissionKey),
          })),
      }));
  }

  /** What a portal offers, so the role editor can list it. */
  catalogue(moduleKey: string) {
    const module = moduleByKey(moduleKey);
    if (!module) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such portal.');
    return permissionsOfModule(moduleKey)
      .filter(([key]) => isAssignable(key))
      .map(([key, def]) => ({
        key,
        kind: def.kind,
        label: def.label,
        hint: def.hint ?? null,
      }));
  }

  async create(input: RoleInput) {
    this.checkPermissions(input);
    const enabled = await this.db.client.moduleState.findUnique({
      where: { moduleKey: input.moduleKey },
    });
    if (!enabled?.enabled) {
      throw new AppError(422, ErrorCode.ROLE_NOT_AVAILABLE, 'That portal is turned off.');
    }

    return this.db.tx(async (tx) => {
      const role = await tx.role.create({
        data: {
          // The extension sets this too; passing it keeps the types honest.
          moduleKey: input.moduleKey,
          name: input.name.trim(),
          description: input.description.trim(),
          createdById: this.auth.actorUserId,
        },
      });
      await tx.rolePermission.createMany({
        data: input.permissionKeys.map((permissionKey) => ({
          roleId: role.id,
          permissionKey,
        })),
      });
      await this.audit.recordIn(tx, {
        action: 'admin.role.created',
        entityType: 'role',
        entityId: role.id,
        summary: `Created the ${role.name} role`,
        after: { name: role.name, permissions: input.permissionKeys },
      });
      return { id: role.id };
    });
  }

  async update(roleId: string, input: Omit<RoleInput, 'moduleKey'>) {
    const role = await this.db.client.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
    if (!role || role.deletedAt) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such role.');
    if (role.systemKey) {
      throw new AppError(
        409,
        ErrorCode.SYSTEM_ROLE,
        'Built-in roles change only when the portal itself is updated. Make a role of your own instead.',
      );
    }
    this.checkPermissions({ ...input, moduleKey: role.moduleKey });

    await this.db.tx(async (tx) => {
      const had = new Set(role.permissions.map((p) => p.permissionKey));
      const want = new Set(input.permissionKeys);
      await tx.role.update({
        where: { id: roleId },
        data: { name: input.name.trim(), description: input.description.trim() },
      });
      const adding = [...want].filter((p) => !had.has(p));
      if (adding.length) {
        await tx.rolePermission.createMany({
          data: adding.map((permissionKey) => ({ roleId, permissionKey })),
          skipDuplicates: true,
        });
      }
      const removing = [...had].filter((p) => !want.has(p));
      if (removing.length) {
        await tx.rolePermission.deleteMany({ where: { roleId, permissionKey: { in: removing } } });
      }
      await this.audit.recordIn(tx, {
        action: 'admin.role.updated',
        entityType: 'role',
        entityId: roleId,
        summary: `Changed the ${input.name} role`,
        before: { name: role.name, permissions: [...had] },
        after: { name: input.name, permissions: [...want] },
      });
    });
  }

  async remove(roleId: string): Promise<void> {
    const role = await this.db.client.role.findUnique({
      where: { id: roleId },
      include: {
        _count: { select: { members: true } },
        members: { include: { user: true } },
      },
    });
    if (!role || role.deletedAt) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such role.');
    if (role.systemKey)
      throw new AppError(409, ErrorCode.SYSTEM_ROLE, 'Built-in roles cannot be deleted.');
    if (role._count.members > 0) {
      throw new AppError(409, ErrorCode.ROLE_IN_USE, 'Take this role away from everyone first.', {
        people: role.members.map((m) => m.user.fullName),
      });
    }

    await this.db.tx(async (tx) => {
      // Kept, not erased: old audit rows name it.
      await tx.role.update({ where: { id: roleId }, data: { deletedAt: new Date() } });
      await this.audit.recordIn(tx, {
        action: 'admin.role.deleted',
        entityType: 'role',
        entityId: roleId,
        summary: `Deleted the ${role.name} role`,
      });
    });
  }

  /**
   * A role may only hold permissions its own portal defines, and never one
   * that comes from leading a department (D28): a role outlives a leadership.
   */
  private checkPermissions(input: RoleInput): void {
    const leadership = input.permissionKeys.filter(
      (key) => key in ALL_PERMISSIONS && !isAssignable(key),
    );
    if (leadership.length) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        'Those come from leading a department, so no role can hold them.',
        { permissionKeys: leadership },
      );
    }
    const owned = new Set(permissionsOfModule(input.moduleKey).map(([key]) => key));
    const foreign = input.permissionKeys.filter((key) => !owned.has(key));
    if (foreign.length) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        'Those permissions belong to another portal.',
        {
          permissionKeys: foreign,
        },
      );
    }
  }
}

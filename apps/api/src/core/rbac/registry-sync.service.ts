import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ALL_MODULES, ALL_PERMISSIONS, CHURCH_MODULES, moduleByKey } from '@irca/shared';
import { PrismaCore } from '../database/prisma-clients.js';

/**
 * Makes the database agree with the code at every boot.
 *
 * Permissions are defined in code, because code is what checks them, but roles
 * point at them with a foreign key, so they have to exist as rows. System roles
 * are code's too: a church gets them when it turns a module on, and they are
 * brought back in step here when the code changes. A permission that
 * disappears from code is retired, never deleted, so a role that still names
 * it keeps loading.
 */
@Injectable()
export class RegistrySync implements OnApplicationBootstrap {
  private readonly logger = new Logger('RegistrySync');

  constructor(private readonly db: PrismaCore) {}

  async onApplicationBootstrap() {
    await this.sync();
  }

  async sync(): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // Two instances booting together must not race each other through this.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('irca:registry-sync'))`;

      const keys = Object.keys(ALL_PERMISSIONS);
      for (const [key, def] of Object.entries(ALL_PERMISSIONS)) {
        const moduleKey = ALL_MODULES.find((m) => key in m.permissions)!.key;
        const data = {
          moduleKey,
          kind: def.kind === 'write' ? ('WRITE' as const) : ('READ' as const),
          label: def.label,
          retiredAt: null,
        };
        await tx.permission.upsert({ where: { key }, update: data, create: { key, ...data } });
      }
      const retired = await tx.permission.updateMany({
        where: { key: { notIn: keys }, retiredAt: null },
        data: { retiredAt: new Date() },
      });

      const churches = await tx.church.findMany({ select: { id: true } });
      for (const church of churches) {
        await this.ensureCoreModules(tx, church.id);
        const enabled = await tx.churchModule.findMany({
          where: { churchId: church.id, enabled: true },
          select: { moduleKey: true },
        });
        for (const { moduleKey } of enabled) await this.ensureModuleRoles(tx, church.id, moduleKey);
      }

      this.logger.log(
        `permissions: ${keys.length} in code, ${retired.count} newly retired; churches: ${churches.length}`,
      );
    });
  }

  /** Core modules (admin) are on for every church and cannot be turned off. */
  private async ensureCoreModules(tx: TxLike, churchId: string): Promise<void> {
    for (const m of CHURCH_MODULES.filter((m) => m.kind === 'core')) {
      await tx.churchModule.upsert({
        where: { churchId_moduleKey: { churchId, moduleKey: m.key } },
        update: { enabled: true },
        create: { churchId, moduleKey: m.key, enabled: true, enabledAt: new Date() },
      });
    }
  }

  /**
   * The module's system roles exist for this church, with exactly the
   * permissions the code gives them. Called at boot, and again whenever a
   * church turns a module on.
   */
  async ensureModuleRoles(tx: TxLike, churchId: string, moduleKey: string): Promise<void> {
    const module = moduleByKey(moduleKey);
    if (!module) return;

    for (const def of module.systemRoles) {
      const role = await tx.role.upsert({
        where: { churchId_systemKey: { churchId, systemKey: def.key } },
        update: { name: def.name, description: def.description, moduleKey, deletedAt: null },
        create: {
          churchId,
          moduleKey,
          systemKey: def.key,
          name: def.name,
          description: def.description,
        },
      });

      const current = await tx.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionKey: true },
      });
      const have = new Set(current.map((p) => p.permissionKey));
      const want = new Set(def.permissions);

      const toAdd = [...want].filter((p) => !have.has(p));
      const toRemove = [...have].filter((p) => !want.has(p));
      if (toAdd.length) {
        await tx.rolePermission.createMany({
          data: toAdd.map((permissionKey) => ({ churchId, roleId: role.id, permissionKey })),
          skipDuplicates: true,
        });
      }
      if (toRemove.length) {
        await tx.rolePermission.deleteMany({
          where: { roleId: role.id, permissionKey: { in: toRemove } },
        });
      }
    }
  }
}

/** What Prisma hands a transaction callback on the core client. */
type TxLike = Parameters<
  Parameters<PrismaCore['$transaction']>[0] extends (tx: infer T) => unknown
    ? (tx: T) => void
    : never
>[0];

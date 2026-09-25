import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { Db, type Tx } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AudienceRegistry, type AudienceProvider } from '../../core/comms/audience.registry.js';
import { AudienceResolver } from '../../core/comms/audience.resolver.js';
import { DepartmentsService } from '../departments/departments.service.js';
import { commsSettings } from './settings.js';

/** Refused for a reason about this sending, not about a permission held: no `required`. */
const refuse = (message: string) => new AppError(403, ErrorCode.FORBIDDEN, message);

/**
 * Who may reach whom (07 step 7.8, rule 4; D21 as amended by D28).
 *
 * Communications (`comms.messages.send`) may use any audience. A department's
 * leader (`comms.department.send`) may use its own department's audiences —
 * everyone in it, or its leaders — for that department and no other, and a
 * church-wide audience only once Communications has granted it to the
 * department. Nothing wider is automatic (D22).
 */
@Injectable()
export class AudiencesService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly registry: AudienceRegistry,
    private readonly resolver: AudienceResolver,
    private readonly departments: DepartmentsService,
  ) {}

  /**
   * May the signed-in person send, for this department (or for
   * Communications when null), to this audience? Throws with the reason.
   * Returns the checked provider and parameters.
   */
  async authorize(tx: Tx, departmentId: string | null, key: string, raw: unknown) {
    const { provider, params } = this.registry.parse(key, raw);
    if (departmentId === null) {
      if (!this.auth.has('comms.messages.send')) {
        throw refuse(
          'Only Communications sends to the whole church, across departments or to leaders.',
        );
      }
      return { provider, params };
    }
    await this.requireLeads(departmentId, 'send');
    if (provider.scope === 'department') {
      const named = provider.departmentsOf?.(params);
      if (named === 'all' || !named || named.some((id) => id !== departmentId)) {
        throw refuse(
          'A department sends to its own people only. Communications sends across departments.',
        );
      }
      return { provider, params };
    }
    const grant = await tx.commsAudienceGrant.findUnique({
      where: { departmentId_audienceKey: { departmentId, audienceKey: key } },
    });
    if (!grant) {
      throw refuse(
        `This department has not been given "${provider.label}". Communications can give it in Comms → Audiences.`,
      );
    }
    return { provider, params };
  }

  /** The department's leader now, with the comms permission for it. */
  async requireLeads(departmentId: string, what: 'send' | 'draft' | 'read') {
    const permission = `comms.department.${what}`;
    if (!this.auth.has(permission) || !(await this.departments.leads(departmentId))) {
      throw refuse('You do not lead this department.');
    }
  }

  /**
   * What the composer offers: for Communications, every audience and every
   * department; for a department, its own and those it was given.
   */
  async options(departmentId: string | null) {
    const departments = await this.db.client.department.findMany({
      where: { archivedAt: null, ...(departmentId ? { id: departmentId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (departmentId === null) {
      if (!this.auth.has('comms.messages.send'))
        throw refuse('You do not send for Communications.');
    } else {
      await this.requireLeads(departmentId, 'send');
      if (!departments.length) throw notFound('No such department.');
    }
    const granted = departmentId
      ? new Set(
          (await this.db.client.commsAudienceGrant.findMany({ where: { departmentId } })).map(
            (g) => g.audienceKey,
          ),
        )
      : null;
    const groups = await this.db.client.foundationGroup.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const audiences = this.registry
      .all()
      .filter((p) => !granted || p.scope === 'department' || granted.has(p.key))
      .map((p) => describe(p));
    return { audiences, departments, groups };
  }

  /** How many a choice reaches now, and how many are left alone, without sending. */
  async count(departmentId: string | null, key: string, params: unknown) {
    return this.db.tx(async (tx) => {
      await this.authorize(tx, departmentId, key, params);
      const { defaultLang } = await commsSettings(tx);
      const { name, recipients } = await this.resolver.resolve(tx, key, params, defaultLang);
      return {
        name,
        reach: recipients.filter((r) => r.status === 'PENDING').length,
        leftAlone: recipients.filter((r) => r.status !== 'PENDING').length,
      };
    });
  }

  /** Comms → Audiences: each church-wide audience, who it reaches today, and who holds it. */
  async list() {
    const grants = await this.db.client.commsAudienceGrant.findMany({
      include: { department: { select: { id: true, name: true } } },
    });
    const { defaultLang } = await commsSettings(this.db.client);
    const out = [];
    for (const provider of this.registry.all().filter((p) => p.scope === 'church')) {
      const reach = await this.db.tx(async (tx) => {
        const params = provider.params.parse({});
        const members = await provider.resolve(tx, params);
        const decided = await this.resolver.decide(tx, members, defaultLang);
        return {
          reach: decided.filter((r) => r.status === 'PENDING').length,
          leftAlone: decided.filter((r) => r.status !== 'PENDING').length,
        };
      });
      out.push({
        ...describe(provider),
        ...reach,
        departments: grants
          .filter((g) => g.audienceKey === provider.key)
          .map((g) => g.department)
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    return out;
  }

  async grant(key: string, departmentId: string) {
    const provider = this.registry.require(key);
    if (provider.scope !== 'church') {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        'A department always reaches its own people.',
      );
    }
    const department = await this.db.client.department.findFirst({
      where: { id: departmentId, archivedAt: null },
    });
    if (!department) throw notFound('No such department.');
    await this.db.tx(async (tx) => {
      await tx.commsAudienceGrant.upsert({
        where: { departmentId_audienceKey: { departmentId, audienceKey: key } },
        update: {},
        create: { departmentId, audienceKey: key, grantedById: this.auth.actorUserId },
      });
      await this.audit.recordIn(tx, {
        action: 'comms.audience.granted',
        entityType: 'department',
        entityId: departmentId,
        summary: `Let ${department.name} send to "${provider.label}"`,
      });
    });
  }

  async revoke(key: string, departmentId: string) {
    const provider = this.registry.require(key);
    const department = await this.db.client.department.findUnique({ where: { id: departmentId } });
    if (!department) throw notFound('No such department.');
    await this.db.tx(async (tx) => {
      const { count } = await tx.commsAudienceGrant.deleteMany({
        where: { departmentId, audienceKey: key },
      });
      if (!count) return;
      await this.audit.recordIn(tx, {
        action: 'comms.audience.revoked',
        entityType: 'department',
        entityId: departmentId,
        summary: `${department.name} may no longer send to "${provider.label}"`,
      });
    });
  }
}

function describe(p: AudienceProvider) {
  return { key: p.key, label: p.label, description: p.description, scope: p.scope };
}

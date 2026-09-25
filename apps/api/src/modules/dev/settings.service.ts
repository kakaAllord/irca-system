import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { Db } from '../../core/database/db.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { ApiClientService } from '../../core/clients/api-client.service.js';
import { AppError } from '../../core/http/app-error.js';

export type ChurchChange = {
  name?: string;
  code?: string;
  timezone?: string;
  currency?: string;
};

/**
 * The church's own settings, and the keys its registration form signs in
 * with.
 *
 * Both used to sit on each church's page in the console above every church.
 * There is one church now, so they are one page of the dev console: set once
 * at launch by church:setup, and rarely touched after.
 */
@Injectable()
export class DevSettingsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly clients: ApiClientService,
  ) {}

  async church() {
    const church = await this.db.client.church.findUniqueOrThrow({ where: { id: 1 } });
    return {
      code: church.code,
      name: church.name,
      timezone: church.timezone,
      currency: church.currency,
      createdAt: church.createdAt,
      // The same rule the trigger in the database keeps, asked in advance so
      // the page can say so instead of offering a field that will be refused.
      codeLocked: (await this.db.client.financeTransaction.count({ take: 1 })) > 0,
    };
  }

  async updateChurch(change: ChurchChange) {
    const before = await this.church();
    if (change.code !== undefined && change.code !== before.code && before.codeLocked) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        `The code is on finance entries now (${before.code}-EXP-…), so it cannot change.`,
      );
    }
    const data = Object.fromEntries(
      Object.entries(change).filter(
        ([key, value]) => value !== undefined && value !== before[key as keyof ChurchChange],
      ),
    ) as ChurchChange;
    if (!Object.keys(data).length) return before;

    await this.db.tx(async (tx) => {
      await tx.church.update({ where: { id: 1 }, data });
      await this.audit.recordIn(tx, {
        action: 'church.updated',
        entityType: 'church',
        entityId: '1',
        summary: `Changed the church's ${Object.keys(data).join(', ')}`,
        before: Object.fromEntries(
          Object.keys(data).map((k) => [k, before[k as keyof ChurchChange]]),
        ),
        after: data,
      });
    });
    return this.church();
  }

  async keys() {
    const clients = await this.clients.list();
    return clients.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      keyPrefix: c.keyPrefix,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
      revokedAt: c.revokedAt,
    }));
  }

  /** The key itself is in this answer and nowhere else, ever. */
  async createKey(name: string) {
    const { key, client } = await this.clients.create({ kind: 'REGISTRATION', name });
    await this.audit.recordNow(
      {
        action: 'dev.api_client.created',
        entityType: 'api_client',
        entityId: client.id,
        summary: `Made the registration key "${client.name}" (${client.keyPrefix}…)`,
      },
      'feature',
    );
    return { id: client.id, key };
  }

  async revokeKey(id: string) {
    const client = (await this.clients.list()).find((c) => c.id === id);
    if (!client || !(await this.clients.revoke(id))) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No live key with that id.');
    }
    await this.audit.recordNow(
      {
        action: 'dev.api_client.revoked',
        entityType: 'api_client',
        entityId: id,
        summary: `Revoked the registration key "${client.name}" (${client.keyPrefix}…)`,
      },
      'feature',
    );
  }
}

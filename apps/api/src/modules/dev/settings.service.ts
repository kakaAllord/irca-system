import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { Db } from '../../core/database/db.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { ApiClientService } from '../../core/clients/api-client.service.js';
import { AppError } from '../../core/http/app-error.js';
import { AlertsService } from '../../core/alerts/alerts.service.js';
import { alertSettings, saveStorageSize } from '../../core/alerts/alert-settings.js';

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
    private readonly alerts: AlertsService,
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

  /**
   * Who hears when something is wrong, what is wrong now, and the one
   * threshold only this church can give: how much storage its plan allows.
   */
  async alertsPage() {
    const [system, comms, active, settings] = await Promise.all([
      this.alerts.recipients('system'),
      this.alerts.recipients('comms'),
      this.alerts.active(),
      alertSettings(this.db.client),
    ]);
    const systemEmails = new Set(system.map((r) => r.email));
    return {
      recipients: system,
      // Communications' people hear about credit and failing texts as well.
      commsOnly: comms.filter((r) => !systemEmails.has(r.email)),
      active,
      dbStorageGb: settings.dbStorageBytes === null ? null : settings.dbStorageBytes / 1024 ** 3,
    };
  }

  async saveAlerts(dbStorageGb: number | null) {
    const before = (await alertSettings(this.db.client)).dbStorageBytes;
    const bytes = dbStorageGb === null ? null : Math.round(dbStorageGb * 1024 ** 3);
    await this.db.tx(async (tx) => {
      await saveStorageSize(tx, bytes);
      await this.audit.recordIn(tx, {
        action: 'dev.alerts.changed',
        entityType: 'settings',
        entityId: 'alerts',
        summary:
          dbStorageGb === null
            ? 'Stopped watching the database storage'
            : `Set the database storage to ${dbStorageGb} GB`,
        before: { dbStorageBytes: before },
        after: { dbStorageBytes: bytes },
      });
    });
    return this.alertsPage();
  }

  /** The whole path, on purpose: an email to each recipient, and a text to each phone. */
  async testAlert() {
    const to = await this.alerts.recipients('system');
    if (!to.length) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'Nobody would receive it: nobody active may read the Health page.',
      );
    }
    await this.alerts.notify({
      key: 'test',
      title: 'A test alert',
      lines: [
        'Somebody pressed Send a test alert in Dev → Settings. If this arrived, alerts reach you.',
      ],
      sms: true,
    });
    await this.audit.recordNow(
      {
        action: 'dev.alerts.tested',
        entityType: 'settings',
        entityId: 'alerts',
        summary: `Sent a test alert to ${to.length} ${to.length === 1 ? 'person' : 'people'}`,
      },
      'feature',
    );
    return { emails: to.length, texts: to.filter((r) => r.phone).length };
  }
}

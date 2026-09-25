import { Injectable } from '@nestjs/common';
import { Db } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { SmsGateway } from '../../core/sms/sms.gateway.js';
import { commsSettings, saveCommsSettings, type CommsSettings } from './settings.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly gateway: SmsGateway,
  ) {}

  /** Everything on the page. The Beem key comes back as its last four characters only. */
  async get() {
    return { ...(await commsSettings(this.db.client)), beem: await this.gateway.summary() };
  }

  async save(next: CommsSettings) {
    await this.db.tx(async (tx) => {
      const before = await commsSettings(tx);
      await saveCommsSettings(tx, next);
      await this.audit.recordIn(tx, {
        action: 'comms.settings.changed',
        entityType: 'settings',
        entityId: 'comms',
        summary: `Changed the messaging settings: ${describe(before, next)}`,
        before,
        after: next,
      });
    });
  }

  /** Audited by what changed, never by the key itself, before or after (D26). */
  async saveBeem(input: { apiKey?: string; secretKey?: string; senderId: string }) {
    const changed = await this.gateway.save(input, this.auth.actorUserId);
    const what = [
      changed.keyChanged && 'the key',
      changed.secretChanged && 'the secret',
      `the sender name (${input.senderId})`,
    ].filter(Boolean);
    await this.audit.recordNow({
      action: 'comms.beem.saved',
      entityType: 'settings',
      entityId: 'beem',
      summary: `Saved the Beem account: ${what.join(', ')}`,
    });
  }

  testBeem() {
    return this.gateway.test();
  }
}

function describe(before: CommsSettings, after: CommsSettings): string {
  const changes = (Object.keys(after) as (keyof CommsSettings)[])
    .filter((k) => before[k] !== after[k])
    .map((k) => `${k} ${before[k] ?? 'none'} → ${after[k] ?? 'none'}`);
  return changes.join(', ') || 'nothing';
}

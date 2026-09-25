import { Injectable } from '@nestjs/common';
import { Db } from '../../core/database/db.service.js';
import { AlertsService } from '../../core/alerts/alerts.service.js';
import { alertSettings } from '../../core/alerts/alert-settings.js';
import { commsSettings } from './settings.js';

/** Fewer finished texts than this in a day say nothing about a failure rate. */
const MIN_TEXTS = 20;

/**
 * Communications' two alarms (docs/plan/10, step 10.4): the credit running
 * out, and texts failing. Both go to the owner and to whoever runs Comms →
 * Settings, since buying credit and finding out why texts fail are theirs.
 */
@Injectable()
export class CommsAlerts {
  constructor(
    private readonly db: Db,
    private readonly alerts: AlertsService,
  ) {}

  /** After each hourly reading of Beem's credit. */
  async checkCredit(credit: string | null): Promise<void> {
    if (credit === null) return;
    const { balanceAlertFloor: floor } = await commsSettings(this.db.client);
    const alert = {
      key: 'sms.credit',
      title: `Text message credit is down to ${Number(credit).toLocaleString('en')}`,
      lines: [
        `Beem's credit is ${credit}, below the ${floor.toLocaleString('en')} set in Comms → Settings. When it runs out, no text is sent.`,
        "Top up in Beem's dashboard; Comms → Settings → Test connection shows the new credit.",
      ],
      audience: 'comms' as const,
      // Someone has to act the same day, and a text is what they will see.
      sms: true,
    };
    if (floor > 0 && Number(credit) < floor) await this.alerts.raise(alert);
    else await this.alerts.clear({ ...alert, title: 'Text message credit was low', lines: [] });
  }

  /** More than 10% of the last day's texts failing. */
  async checkFailing(): Promise<Record<string, number>> {
    const { smsFailurePercent: percent } = await alertSettings(this.db.client);
    const [row] = await this.db.client.$queryRaw<{ done: number; failed: number }[]>`
      select count(*) filter (where r.status in ('SENT', 'DELIVERED', 'FAILED'))::int as done,
             count(*) filter (where r.status = 'FAILED')::int as failed
      from comms_recipients r
      join comms_messages m on m.id = r.message_id
      where m.started_at > now() - interval '1 day'`;
    const done = row?.done ?? 0;
    const failed = row?.failed ?? 0;
    if (done < MIN_TEXTS) return { done, failed };

    const rate = (failed / done) * 100;
    const alert = {
      key: 'sms.failing',
      title: `${rate.toFixed(0)}% of today's texts failed`,
      lines: [
        `${failed} of the ${done} texts sent in the last day failed.`,
        'Comms → History shows each message and why its texts failed; Comms → Settings → Test connection checks the Beem account.',
      ],
      audience: 'comms' as const,
    };
    if (rate > percent) await this.alerts.raise(alert);
    else await this.alerts.clear({ ...alert, title: 'Texts were failing', lines: [] });
    return { done, failed };
  }
}

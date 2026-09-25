import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaDb } from '../database/prisma-clients.js';
import { EmailService } from '../email/email.service.js';
import { PermissionResolver } from '../rbac/permission-resolver.service.js';
import { SmsGateway } from '../sms/sms.gateway.js';
import { toE164 } from '../sms/phone.js';
import { UsageService } from '../usage/usage.service.js';

/** While a problem lasts, it is said again this often, not every ten minutes. */
const REPEAT_MS = 12 * 60 * 60_000;

/**
 * Who hears about it. `system`: whoever may read the dev console's Health
 * page, which is the owner (the Developer role) and anyone given the Watcher
 * role for this. `comms`: those, and whoever runs Communications' settings,
 * because the credit and failing texts are theirs to act on.
 */
export type AlertAudience = 'system' | 'comms';

export type AlertMessage = {
  key: string;
  title: string;
  lines: string[];
  audience?: AlertAudience;
  /**
   * Also by text message: when email itself may be what is broken, and for
   * the credit running out, which somebody must act on the same day.
   */
  sms?: boolean;
};

export type AlertRecipient = { name: string; email: string; phone: string | null };

/**
 * Tells the owner, before a pastor does, that something is wrong
 * (docs/plan/10, step 10.4). The checks decide what is wrong; this decides
 * who hears, how, and how often.
 *
 * An alert is a condition: raised once when it starts, repeated twice a day
 * while it lasts, and cleared with a word when it stops, so a problem is
 * neither missed nor sent every ten minutes. Emails go through the outbox
 * like every other; the text message goes straight to the provider, because
 * an alert is for the staff who run the system, not a message from the church.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger('Alerts');

  constructor(
    private readonly db: PrismaDb,
    private readonly email: EmailService,
    private readonly gateway: SmsGateway,
    private readonly permissions: PermissionResolver,
    private readonly config: AppConfig,
    private readonly usage: UsageService,
  ) {}

  /** The condition holds now. Returns whether anybody was told this time. */
  async raise(alert: AlertMessage): Promise<boolean> {
    const row = await this.db.alert.findUnique({ where: { key: alert.key } });
    const now = new Date();
    if (row?.active && now.getTime() - row.lastSentAt.getTime() < REPEAT_MS) {
      if (row.summary !== alert.title) {
        await this.db.alert.update({ where: { key: alert.key }, data: { summary: alert.title } });
      }
      return false;
    }
    await this.db.alert.upsert({
      where: { key: alert.key },
      create: {
        key: alert.key,
        active: true,
        summary: alert.title,
        raisedAt: now,
        lastSentAt: now,
      },
      update: {
        active: true,
        summary: alert.title,
        lastSentAt: now,
        ...(row?.active ? {} : { raisedAt: now }),
      },
    });
    await this.send(row?.active ? 'again' : 'raised', alert);
    return true;
  }

  /** The condition no longer holds: said once, if it had been raised. */
  async clear(alert: AlertMessage): Promise<boolean> {
    const { count } = await this.db.alert.updateMany({
      where: { key: alert.key, active: true },
      data: { active: false },
    });
    if (!count) return false;
    // Resolving is good news; it never needs a text message.
    await this.send('resolved', { ...alert, sms: false });
    return true;
  }

  /** A one-off event, such as an email given up on: told once, nothing to clear. */
  async notify(alert: AlertMessage): Promise<void> {
    await this.send('raised', alert);
  }

  /** How far a check has read, kept between runs (not an alert of its own). */
  async cursor<T>(key: string): Promise<T | null> {
    const row = await this.db.alert.findUnique({ where: { key } });
    return (row?.detail as T | null) ?? null;
  }

  async setCursor(key: string, detail: Prisma.InputJsonValue): Promise<void> {
    await this.db.alert.upsert({
      where: { key },
      create: { key, detail },
      update: { detail },
    });
  }

  /** What is wrong right now, for the dev console. */
  active() {
    return this.db.alert.findMany({
      where: { active: true },
      orderBy: { raisedAt: 'asc' },
      select: { key: true, summary: true, raisedAt: true, lastSentAt: true },
    });
  }

  /**
   * Everyone active who may read the Health page (and, for `comms`, run
   * Communications' settings), worked out by the same resolver sign-in uses,
   * so a leader's permissions count too. A church has tens of users, not
   * thousands, so asking for each is cheap.
   */
  async recipients(audience: AlertAudience = 'system'): Promise<AlertRecipient[]> {
    const users = await this.db.user.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        person: { select: { dial: true, phone: true } },
      },
    });
    const out: AlertRecipient[] = [];
    for (const user of users) {
      const may = await this.permissions.forUser(user.id);
      const hears =
        may.has('dev.health.read') || (audience === 'comms' && may.has('comms.settings.manage'));
      if (!hears) continue;
      out.push({
        name: user.fullName,
        email: user.email,
        phone: user.person ? toE164(user.person.dial, user.person.phone) : null,
      });
    }
    return out;
  }

  private async send(state: 'raised' | 'again' | 'resolved', alert: AlertMessage): Promise<void> {
    const to = await this.recipients(alert.audience ?? 'system');
    if (!to.length) {
      this.logger.error({
        msg: 'an alert has nobody to go to',
        key: alert.key,
        title: alert.title,
      });
      return;
    }
    const link = `${this.config.get('PORTAL_ORIGIN')}/dev`;
    for (const r of to) {
      await this.email.enqueueNow({
        to: r.email,
        template: 'alert',
        payload: { state, title: alert.title, lines: alert.lines, link },
      });
    }
    this.usage.inc('alerts.sent');
    this.logger.warn({ msg: `alert ${state}`, key: alert.key, title: alert.title });

    if (!alert.sms) return;
    const { provider, senderId } = await this.gateway.current();
    const body = `IRCA alert: ${alert.title}. ${alert.lines[0] ?? ''}`.slice(0, 300);
    for (const r of to) {
      if (!r.phone) continue;
      try {
        const result = await provider.send({ to: r.phone, body, senderId });
        if (result.accepted) this.usage.inc('alerts.sms');
        else this.logger.error({ msg: 'alert text not sent', key: alert.key, error: result.error });
      } catch (err) {
        this.logger.error({ msg: 'alert text not sent', key: alert.key, err });
      }
    }
  }
}

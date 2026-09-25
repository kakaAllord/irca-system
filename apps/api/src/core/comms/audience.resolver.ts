import { Injectable } from '@nestjs/common';
import { SMS_LANGS, type SmsLang } from '@irca/shared';
import type { Tx } from '../database/db.service.js';
import { toE164 } from '../sms/phone.js';
import { AudienceRegistry, type AudienceMember } from './audience.registry.js';

export type Skip = 'SKIPPED_OPT_OUT' | 'SKIPPED_NO_PHONE' | 'SKIPPED_DUPLICATE' | 'SKIPPED_RECENT';

/** One person, decided: who, which number, which language, and whether they are sent to. */
export type Resolved = {
  personId: string | null;
  userId: string | null;
  name: string;
  /** E.164, or '' when there is no usable number. */
  phone: string;
  lang: SmsLang;
  status: 'PENDING' | Skip;
  /** What the audience fills in for them, in a given language. */
  blanks?: (lang: SmsLang) => Record<string, string>;
};

/**
 * The rules every audience obeys, in one place so no caller can forget one
 * (07 step 7.8, D22):
 *
 * 1. Never a number that is blocked, nor a person or staff account that opted
 *    out. They are still listed, as SKIPPED_OPT_OUT, so the sender sees
 *    "12 of 143 were left alone".
 * 2. One message per number: someone listed twice (a leader who is also a
 *    member) is SKIPPED_DUPLICATE the second time.
 * 3. A number that isn't one is SKIPPED_NO_PHONE.
 * 4. For an audience that reminds (pledges), anyone it reached within the
 *    cooldown — by number or by person, from any sender — is SKIPPED_RECENT.
 *
 * Who may use which audience is the sender's check, not this one.
 */
@Injectable()
export class AudienceResolver {
  constructor(private readonly registry: AudienceRegistry) {}

  async resolve(tx: Tx, key: string, raw: unknown, defaultLang: SmsLang, cooldownDays = 0) {
    const { provider, params } = this.registry.parse(key, raw);
    const name = await provider.describe(tx, params);
    const members = await provider.resolve(tx, params);
    const recipients = await this.decide(tx, members, defaultLang);
    if (provider.cooldown && cooldownDays > 0) {
      await this.coolDown(tx, key, recipients, cooldownDays);
    }
    return { provider, params, name, recipients };
  }

  /**
   * Leaves alone whoever this audience reached within the last `days` — or
   * will reach within them, from a message already scheduled — whichever
   * department sent it and whatever it was about. Counted by number and by
   * person: a family sharing a phone is still one phone.
   */
  private async coolDown(tx: Tx, key: string, recipients: Resolved[], days: number) {
    const pending = recipients.filter((r) => r.status === 'PENDING');
    if (!pending.length) return;
    const now = Date.now();
    const from = new Date(now - days * 86_400_000);
    const to = new Date(now + days * 86_400_000);
    const reached = await tx.commsRecipient.findMany({
      where: {
        status: { in: ['PENDING', 'SENDING', 'SENT', 'DELIVERED'] },
        OR: [
          { phone: { in: pending.map((r) => r.phone) } },
          { personId: { in: pending.flatMap((r) => (r.personId ? [r.personId] : [])) } },
        ],
        message: {
          audienceKey: key,
          status: { not: 'CANCELLED' },
          OR: [
            { scheduledFor: { gt: from, lt: to } },
            { scheduledFor: null, createdAt: { gt: from, lt: to } },
          ],
        },
      },
      select: { phone: true, personId: true },
    });
    const phones = new Set(reached.map((r) => r.phone));
    const people = new Set(reached.flatMap((r) => (r.personId ? [r.personId] : [])));
    for (const r of pending) {
      if (phones.has(r.phone) || (r.personId && people.has(r.personId))) {
        r.status = 'SKIPPED_RECENT';
      }
    }
  }

  async decide(tx: Tx, members: AudienceMember[], defaultLang: SmsLang): Promise<Resolved[]> {
    const withPhone = members.map((m) => ({ m, phone: toE164(m.dial, m.phone) }));
    const numbers = [...new Set(withPhone.map((x) => x.phone).filter((p): p is string => !!p))];
    const blocked = new Set(
      numbers.length
        ? (
            await tx.commsBlockedNumber.findMany({
              where: { phone: { in: numbers } },
              select: { phone: true },
            })
          ).map((b) => b.phone)
        : [],
    );

    const seen = new Set<string>();
    return withPhone.map(({ m, phone }) => {
      const lang = (SMS_LANGS as readonly string[]).includes(m.lang ?? '')
        ? (m.lang as SmsLang)
        : defaultLang;
      const base = {
        personId: m.personId ?? null,
        userId: m.userId ?? null,
        name: m.name,
        phone: phone ?? '',
        lang,
        blanks: m.blanks,
      };
      if (!phone) return { ...base, status: 'SKIPPED_NO_PHONE' as const };
      if (m.optedOut || blocked.has(phone)) return { ...base, status: 'SKIPPED_OPT_OUT' as const };
      if (seen.has(phone)) return { ...base, status: 'SKIPPED_DUPLICATE' as const };
      seen.add(phone);
      return { ...base, status: 'PENDING' as const };
    });
  }
}

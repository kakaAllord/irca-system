import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AmountSchema, formatMoney, type SmsLang } from '@irca/shared';
import { AudienceRegistry } from '../../core/comms/audience.registry.js';
import { empty, sql } from '../../core/database/sql.js';
import { notFound } from '../../core/http/app-error.js';
import { today } from './pledges.service.js';

const Params = z.object({
  /** One campaign; left out, every campaign. */
  campaignId: z.uuid('Choose a campaign').optional(),
  /** Only those who still owe more than this. */
  minBalance: AmountSchema.optional(),
  /** Only pledges past the date they were to be paid by. */
  overdueOnly: z.boolean().optional(),
});
type Params = z.infer<typeof Params>;

const LOCALE: Record<SmsLang, string> = { sw: 'sw', en: 'en-GB', fr: 'fr' };

/**
 * People who still owe on a pledge, as an audience (09 step 9.3).
 *
 * Church-wide, so only Communications uses it until it grants it to the
 * Finance department in Comms → Audiences, whose leaders then send the
 * reminders. It reminds, so nobody in it is texted twice within
 * Communications' cooldown, however many campaigns or beats there are.
 *
 * Each person is in it once. Someone with two open pledges is reminded
 * about the one due soonest, then the one with most left, and its figures
 * are the ones a template's blanks carry — already written the way a text
 * says them, in the person's own language: "150,000 TZS", "12 Oktoba".
 * Whether a figure is said at all is the template's, and so Communications'
 * approval's (docs/modules/pledges-brief.md, question 3).
 */
@Injectable()
export class PledgeAudience implements OnModuleInit {
  constructor(private readonly registry: AudienceRegistry) {}

  onModuleInit(): void {
    this.registry.register<Params>({
      key: 'finance.pledge_outstanding',
      label: 'People who still owe on a pledge',
      description:
        'Everyone with an open pledge and something left to pay: one text each, however many pledges, and nobody twice in a fortnight.',
      scope: 'church',
      cooldown: true,
      fills: ['campaign_name', 'amount', 'balance', 'due_date'],
      params: Params,
      describe: async (tx, params) => {
        let name = 'People who still owe on a pledge';
        if (params.campaignId) {
          const campaign = await tx.pledgeCampaign.findUnique({
            where: { id: params.campaignId },
          });
          if (!campaign) throw notFound('No such campaign.');
          name = `People who still owe on ${campaign.name}`;
        }
        return params.overdueOnly ? `${name}, overdue` : name;
      },
      resolve: async (tx, params) => {
        const church = await tx.church.findFirst({ select: { currency: true } });
        const currency = church?.currency ?? 'TZS';
        const now = await today(tx);
        const rows = await tx.$queryRaw<
          {
            person_id: string;
            full_name: string;
            dial: string;
            phone: string;
            lang: string | null;
            sms_opt_out: boolean;
            campaign_name: string;
            amount: string;
            balance: string;
            due_on: Date | null;
          }[]
        >(sql`
          select distinct on (pe.id)
                 pe.id as person_id, pe.full_name, pe.dial, pe.phone, pe.lang, pe.sms_opt_out,
                 c.name as campaign_name, p.amount::text as amount,
                 (p.amount - x.paid)::text as balance, p.due_on
          from pledges p
          join people pe on pe.id = p.person_id
          join pledge_campaigns c on c.id = p.campaign_id
          cross join lateral (
            select coalesce(sum(pp.amount), 0)::numeric(14, 2) as paid from pledge_payments pp
            where pp.pledge_id = p.id and pp.status = 'POSTED'
          ) x
          where p.status = 'OPEN'
            and p.amount - x.paid > ${params.minBalance ?? '0'}::numeric
            ${params.campaignId ? sql`and p.campaign_id = ${params.campaignId}::uuid` : empty}
            ${params.overdueOnly ? sql`and p.due_on < ${now}::date` : empty}
          order by pe.id, p.due_on nulls last, (p.amount - x.paid) desc, p.id`);

        const money = (value: string) => `${formatMoney(value, '')} ${currency}`;
        return rows
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
          .map((r) => ({
            personId: r.person_id,
            name: r.full_name,
            dial: r.dial,
            phone: r.phone,
            lang: r.lang,
            optedOut: r.sms_opt_out,
            blanks: (lang: SmsLang) => ({
              campaign_name: r.campaign_name,
              amount: money(r.amount),
              balance: money(r.balance),
              due_date: r.due_on
                ? r.due_on.toLocaleDateString(LOCALE[lang], {
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  })
                : '',
            }),
          }));
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Db } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { sql } from '../../core/database/sql.js';

/**
 * Comms → Overview (07 steps 7.13 and 7.14): this month's messages, what they
 * cost and how they fared, by department, so a department can be shown what
 * it spends; the credit left; what is waiting for approval; and the replies
 * people sent, which deserve to be read.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
  ) {}

  async month() {
    const church = await this.db.client.church.findFirst();
    const tz = church?.timezone ?? 'Africa/Dar_es_Salaam';
    const byDepartment = await this.db.tx((tx) =>
      tx.$queryRaw<
        {
          department_id: string | null;
          name: string | null;
          messages: number;
          people: number;
          segments: number;
          cost: string;
          delivered: number;
          failed: number;
        }[]
      >(sql`
        with month as (
          select m.* from comms_messages m
          where m.status <> 'CANCELLED'
            and date_trunc('month', m.created_at at time zone ${tz})
              = date_trunc('month', now() at time zone ${tz})
        )
        select m.department_id, d.name,
               count(*)::int as messages,
               sum(m.recipient_count)::int as people,
               sum(m.segments)::int as segments,
               sum(m.cost)::text as cost,
               (select count(*)::int from comms_recipients r join month x on x.id = r.message_id
                 where x.department_id is not distinct from m.department_id and r.status = 'DELIVERED') as delivered,
               (select count(*)::int from comms_recipients r join month x on x.id = r.message_id
                 where x.department_id is not distinct from m.department_id and r.status = 'FAILED') as failed
        from month m
        left join departments d on d.id = m.department_id
        group by m.department_id, d.name
        order by sum(m.cost) desc`),
    );
    const [credit] = await this.db.client.usageDaily.findMany({
      where: { metric: 'sms.balance' },
      orderBy: { day: 'desc' },
      take: 1,
    });
    const pendingTemplates = await this.db.client.commsTemplate.count({
      where: { status: 'PENDING' },
    });
    const replies = await this.db.client.commsInbound.findMany({
      where: { kind: 'reply' },
      orderBy: { receivedAt: 'desc' },
      take: 15,
      select: { id: true, phone: true, body: true, action: true, receivedAt: true },
    });
    const whole = this.auth.has('membership.people.read_sensitive');
    return {
      byDepartment: byDepartment.map((r) => ({
        department: r.department_id ? { id: r.department_id, name: r.name ?? '' } : null,
        messages: r.messages,
        people: r.people,
        segments: r.segments,
        cost: Number(r.cost).toFixed(2),
        delivered: r.delivered,
        failed: r.failed,
      })),
      credit: credit
        ? { amount: Number(credit.value), day: credit.day.toISOString().slice(0, 10) }
        : null,
      pendingTemplates,
      replies: replies.map((r) => ({
        id: r.id,
        from: whole ? r.phone : r.phone ? `…${r.phone.slice(-3)}` : '',
        text: r.body,
        stopped: r.action === 'opted out',
        at: r.receivedAt.toISOString(),
      })),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import type { InteractionKind } from '../../generated/prisma/client.js';
import { Db, type Tx } from '../../core/database/db.service.js';
import { sql } from '../../core/database/sql.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { readTimeline, recordInteraction } from '../membership/timeline.js';
import { dialable, today } from './reached.service.js';
import { day, toDay } from './sessions.service.js';

export const FOLLOW_UPS = ['CALL', 'VISIT', 'INVITED', 'ATTENDED_SERVICE'] as const;
export type FollowUpKind = (typeof FOLLOW_UPS)[number];

export type FollowUpInput = {
  kind: FollowUpKind;
  note?: string;
  /** When it happened, when that was not today: a call made yesterday. */
  on?: string;
  /** Nothing more to do for now: clears "needs following up" on their reaches. */
  done?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WORDS: Record<Exclude<FollowUpKind, 'ATTENDED_SERVICE'>, string> = {
  CALL: 'Follow-up call',
  VISIT: 'Home visit',
  INVITED: 'Invited to church',
};

/**
 * After the doorstep: calls, visits, invitations, and whether they came.
 *
 * Every one is its own line on the person's timeline, as many as it takes and
 * in any order — the owner: "every interaction is recorded separately, so
 * someone can be contacted or visited multiple times". It is not a pipeline.
 *
 * Outreach sees a person here only when it reached them. Asking for anyone
 * else answers 404, so these routes cannot be used to read the rest of People.
 */
@Injectable()
export class FollowupService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
  ) {}

  /**
   * People still to follow up, the longest waiting first, each with the last
   * thing that happened and their number, since following up by phone is the
   * team's job.
   */
  async pending() {
    const rows = await this.db.client.$queryRaw<
      {
        person_id: string;
        full_name: string;
        dial: string;
        phone: string;
        first_on: Date;
        area: string;
        followups: number;
        last_summary: string | null;
        last_at: Date | null;
      }[]
    >(sql`
      with pending as (
        select person_id, min(reached_on) as first_on,
               (array_agg(area order by reached_on desc) filter (where area <> ''))[1] as area
        from outreach_reached where needs_follow_up
        group by person_id
      )
      select p.id as person_id, p.full_name, p.dial, p.phone, w.first_on,
             coalesce(w.area, '') as area,
             (select count(*)::int from person_interactions i
               where i.person_id = p.id and i.kind in ('CALL', 'VISIT', 'INVITED')) as followups,
             l.summary as last_summary, l.at as last_at
      from pending w
      join people p on p.id = w.person_id
      left join lateral (
        select summary, at from person_interactions i
        where i.person_id = p.id order by at desc, id desc limit 1
      ) l on true
      order by w.first_on, p.full_name
      limit 500`);
    return rows.map((r) => ({
      personId: r.person_id,
      name: r.full_name,
      phone: dialable(r.dial, r.phone),
      reachedOn: day(r.first_on),
      area: r.area,
      followups: r.followups,
      last: r.last_at ? { summary: r.last_summary ?? '', at: r.last_at.toISOString() } : null,
    }));
  }

  /** One person Outreach reached: who they are, each time they were reached, and their timeline. */
  async person(personId: string) {
    const person = await this.reached(this.db.client, personId);
    const [reaches, timeline] = await Promise.all([
      this.db.client.outreachReached.findMany({
        where: { personId },
        orderBy: { reachedOn: 'desc' },
        include: { session: { select: { id: true, title: true, heldOn: true } } },
      }),
      readTimeline(this.db.client, personId),
    ]);
    const byIds = [...new Set(reaches.flatMap((r) => r.reachedByIds))];
    const team = await this.db.client.person.findMany({
      where: { id: { in: byIds } },
      select: { id: true, fullName: true },
    });
    const nameOf = new Map(team.map((p) => [p.id, p.fullName]));
    return {
      id: person.id,
      name: person.fullName,
      phone: dialable(person.dial, person.phone),
      stage: person.stage,
      lang: person.lang,
      optedOut: person.smsOptOut,
      needsFollowUp: reaches.some((r) => r.needsFollowUp),
      reaches: reaches.map((r) => ({
        id: r.id,
        reachedOn: day(r.reachedOn),
        area: r.area,
        note: r.note,
        needsFollowUp: r.needsFollowUp,
        reachedBy: r.reachedByIds.map((id) => nameOf.get(id) ?? 'Someone erased'),
        session: r.session
          ? { id: r.session.id, title: r.session.title, heldOn: day(r.session.heldOn) }
          : null,
      })),
      timeline,
    };
  }

  async record(personId: string, input: FollowUpInput) {
    await this.db.tx(async (tx) => {
      const person = await this.reached(tx, personId);
      const now = await today(tx);
      const on = input.on ?? now;
      if (on > now) {
        throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That date is in the future.', {
          on: ['Not later than today'],
        });
      }
      const note = input.note?.trim() ?? '';
      const words =
        input.kind === 'ATTENDED_SERVICE' ? await this.came(tx, personId) : WORDS[input.kind];
      await recordInteraction(tx, {
        personId,
        kind: input.kind as InteractionKind,
        moduleKey: 'outreach',
        byId: this.auth.userId,
        summary: note ? `${words} — ${note}` : words,
        at: on === now ? new Date() : toDay(on),
      });
      if (input.done) {
        await tx.outreachReached.updateMany({
          where: { personId, needsFollowUp: true },
          data: { needsFollowUp: false },
        });
      }
      await this.audit.recordIn(tx, {
        action: 'outreach.followup.recorded',
        entityType: 'person',
        entityId: personId,
        summary: `${words} for ${person.fullName}${input.done ? ', and no more following up for now' : ''}`,
      });
    });
    if (input.kind !== 'ATTENDED_SERVICE') this.usage.inc('outreach.followups');
    if (input.kind === 'VISIT') this.usage.inc('outreach.visits');
  }

  /** "First time at church", once; "Came to church again" after that. */
  private async came(tx: Tx, personId: string) {
    const before = await tx.personInteraction.count({
      where: { personId, kind: 'ATTENDED_SERVICE' },
    });
    return before ? 'Came to church again' : 'First time at church';
  }

  /** The person, only when Outreach reached them; everyone else is not Outreach's to see. */
  private async reached(tx: Pick<Tx, 'person'>, personId: string) {
    const nobody = notFound('Outreach has not reached anyone by that id.');
    // Not an id at all is not someone Outreach reached either.
    if (!UUID.test(personId)) throw nobody;
    const person = await tx.person.findFirst({
      where: { id: personId, outreachReached: { some: {} } },
    });
    if (!person) throw nobody;
    return person;
  }
}

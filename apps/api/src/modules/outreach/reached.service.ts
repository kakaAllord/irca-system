import { Injectable } from '@nestjs/common';
import { ErrorCode, type SmsLang } from '@irca/shared';
import { Db, type Tx } from '../../core/database/db.service.js';
import { sql, type Sql } from '../../core/database/sql.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { toE164 } from '../../core/sms/phone.js';
import { commsSettings } from '../comms/settings.js';
import { moveStage } from '../membership/journey.js';
import { recordInteraction } from '../membership/timeline.js';
import { day, toDay } from './sessions.service.js';
import { TeamService } from './team.service.js';

export type ReachedInput = {
  sessionId?: string | null;
  teamId?: string | null;
  fullName: string;
  dial: string;
  phone: string;
  area?: string;
  reachedByIds?: string[];
  lang?: SmsLang;
  /** The evangelist asked, and they said yes (D22). */
  mayMessage: boolean;
  needsFollowUp?: boolean;
  /** They gave their life to Christ when reached. */
  saved?: boolean;
  note?: string;
  /** Only for someone reached away from a Saturday; a team brings its own date. */
  reachedOn?: string;
  /** "Same person": add this reach to someone already known. */
  samePersonId?: string;
  /** "Someone else": the candidates offered were not them. */
  notSamePerson?: boolean;
};

export type ReachedQuery = {
  sessionId?: string;
  q?: string;
  thin?: boolean;
  from?: string;
  to?: string;
  page?: number;
};

/** How close a name must be, with no phone to go by, to ask "same person?". */
const SIMILAR_NAME = 0.55;
const PAGE = 50;

/**
 * A phone number as digits, the way two records of it can be compared: the
 * dialling code and the rest, with a leading 0 read as the trunk prefix
 * people type out of habit (0712 → +255 712), as `toE164` reads it. Null
 * when there is no number.
 */
export function phoneKey(dial: string, phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return null;
  if (phone.trim().startsWith('+')) return digits;
  return `${dial.replace(/\D/g, '')}${digits.replace(/^0+/, '')}`;
}

/** The same key, in SQL, for the people already in the list. */
const PERSON_PHONE_KEY = sql`case when p.phone like '+%'
  then regexp_replace(p.phone, '\\D', '', 'g')
  else regexp_replace(p.dial, '\\D', '', 'g')
    || regexp_replace(regexp_replace(p.phone, '\\D', '', 'g'), '^0+', '') end`;

/**
 * A number as the team dials it: +255712345678, which works from any phone,
 * or as it was typed when it is not a number anything could ring.
 */
export function dialable(dial: string, phone: string): string {
  if (!phone) return '';
  return toE164(dial, phone) ?? (phone.startsWith('+') ? phone : `${dial} ${phone}`);
}

/** "Peter Mushi and John Laizer", "Peter, John and Grace". */
export function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

/**
 * People reached on a Saturday, recorded in four fields (08 step 8.5).
 *
 * Someone reached becomes a person in the church's one list (D23), unless
 * they already are one: before anyone is made, the phone number is compared
 * with everyone's, or with no number the name, and the recorder is asked
 * "same person?" instead of a second record being saved. The answer comes
 * back with the request that is sent again.
 *
 * Their name and number are the office's to correct, in Membership. What
 * Outreach fills in later is its own: the area, the note, and whether they
 * still need following up.
 */
@Injectable()
export class ReachedService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly team: TeamService,
  ) {}

  async record(input: ReachedInput) {
    const saved = await this.db.tx(async (tx) => {
      const where = await this.where(tx, input);
      const reachedBy = await tx.person.findMany({
        where: { id: { in: where.reachedByIds } },
        select: { id: true, fullName: true },
      });

      const person = await this.person(tx, input);
      const reached = await tx.outreachReached.create({
        data: {
          personId: person.id,
          sessionId: where.sessionId,
          teamId: where.teamId,
          reachedOn: toDay(where.reachedOn),
          area: where.area,
          reachedByIds: where.reachedByIds,
          needsFollowUp: input.needsFollowUp ?? true,
          saved: input.saved ?? false,
          note: input.note ?? '',
          recordedById: this.auth.userId!,
        },
      });
      if (input.saved) await this.markSaved(tx, person.id);

      const by = names(
        where.reachedByIds.map((id) => reachedBy.find((p) => p.id === id)?.fullName ?? ''),
      );
      await recordInteraction(tx, {
        personId: person.id,
        kind: 'EVANGELISED',
        moduleKey: 'outreach',
        byId: this.auth.userId,
        summary:
          [by ? `Evangelised by ${by}` : 'Evangelised', where.area].filter(Boolean).join(', ') +
          (input.saved ? ' — gave their life to Christ' : ''),
        // A Saturday typed up on Monday happened on Saturday.
        at: where.reachedOn === (await today(tx)) ? new Date() : toDay(where.reachedOn),
        meta: { reachedId: reached.id, sessionId: where.sessionId },
      });
      // Never the number: the activity log is read more widely than People.
      await this.audit.recordIn(tx, {
        action: 'outreach.reached.recorded',
        entityType: 'person',
        entityId: person.id,
        summary: `Recorded ${person.fullName} as reached${where.area ? ` in ${where.area}` : ''}${input.saved ? ', saved' : ''}${person.known ? ', already known' : ''}`,
      });
      return { reachedId: reached.id, personId: person.id, known: person.known };
    });
    this.usage.inc('outreach.reached');
    return saved;
  }

  /**
   * The area, the note, whether they still need following up, and whether
   * they were saved: filled in later, when the team meets after a Saturday.
   */
  async update(
    id: string,
    input: { area?: string; note?: string; needsFollowUp?: boolean; saved?: boolean },
  ) {
    await this.db.tx(async (tx) => {
      const before = await tx.outreachReached.findUnique({
        where: { id },
        include: { person: { select: { fullName: true } } },
      });
      if (!before) throw notFound('No such record.');
      await tx.outreachReached.update({
        where: { id },
        data: {
          ...(input.area !== undefined ? { area: input.area } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.needsFollowUp !== undefined ? { needsFollowUp: input.needsFollowUp } : {}),
          ...(input.saved !== undefined ? { saved: input.saved } : {}),
        },
      });
      if (input.saved && !before.saved) {
        await this.markSaved(tx, before.personId);
        await recordInteraction(tx, {
          personId: before.personId,
          kind: 'NOTE',
          moduleKey: 'outreach',
          byId: this.auth.userId,
          summary: 'Gave their life to Christ when reached',
          at: before.reachedOn,
          meta: { reachedId: id },
        });
      }
      await this.audit.recordIn(tx, {
        action: 'outreach.reached.updated',
        entityType: 'person',
        entityId: before.personId,
        summary: `Filled in the reach of ${before.person.fullName}`,
        before: { area: before.area, needsFollowUp: before.needsFollowUp, saved: before.saved },
        after: {
          area: input.area ?? before.area,
          needsFollowUp: input.needsFollowUp ?? before.needsFollowUp,
          saved: input.saved ?? before.saved,
        },
      });
    });
  }

  /**
   * The Reached list: newest first, with the number, and marked where the
   * record is still thin — no phone, no area — so the team can see what is
   * worth finishing.
   */
  async list(query: ReachedQuery) {
    const clauses: Sql[] = [sql`true`];
    if (query.sessionId) clauses.push(sql`r.session_id = ${query.sessionId}::uuid`);
    if (query.from) clauses.push(sql`r.reached_on >= ${query.from}::date`);
    if (query.to) clauses.push(sql`r.reached_on <= ${query.to}::date`);
    if (query.thin) clauses.push(sql`(p.phone = '' or r.area = '')`);
    const q = query.q?.trim().toLowerCase();
    if (q) {
      const like = `%${q}%`;
      clauses.push(sql`(lower(p.full_name) like ${like} or (p.dial || p.phone) like ${like})`);
    }
    const where = clauses.reduce((a, b) => sql`${a} and ${b}`);
    const page = Math.max(1, query.page ?? 1);

    const [rows, total] = await Promise.all([
      this.db.client.$queryRaw<
        {
          id: string;
          person_id: string;
          full_name: string;
          dial: string;
          phone: string;
          area: string;
          reached_on: Date;
          reached_by_ids: string[];
          needs_follow_up: boolean;
          saved: boolean;
          note: string;
          session_id: string | null;
          session_title: string | null;
          session_on: Date | null;
        }[]
      >(sql`
        select r.id, r.person_id, p.full_name, p.dial, p.phone, r.area, r.reached_on,
               r.reached_by_ids, r.needs_follow_up, r.saved, r.note,
               s.id as session_id, s.title as session_title, s.held_on as session_on
        from outreach_reached r
        join people p on p.id = r.person_id
        left join outreach_sessions s on s.id = r.session_id
        where ${where}
        order by r.reached_on desc, r.created_at desc
        limit ${PAGE} offset ${(page - 1) * PAGE}`),
      this.db.client.$queryRaw<{ n: number }[]>(sql`
        select count(*)::int as n from outreach_reached r
        join people p on p.id = r.person_id
        where ${where}`),
    ]);

    const byIds = [...new Set(rows.flatMap((r) => r.reached_by_ids))];
    const team = await this.db.client.person.findMany({
      where: { id: { in: byIds } },
      select: { id: true, fullName: true },
    });
    const nameOf = new Map(team.map((p) => [p.id, p.fullName]));

    return {
      total: total[0]?.n ?? 0,
      pageSize: PAGE,
      rows: rows.map((r) => ({
        id: r.id,
        personId: r.person_id,
        name: r.full_name,
        phone: dialable(r.dial, r.phone),
        area: r.area,
        reachedOn: day(r.reached_on),
        reachedBy: r.reached_by_ids.map((id) => nameOf.get(id) ?? 'Someone erased'),
        needsFollowUp: r.needs_follow_up,
        saved: r.saved,
        note: r.note,
        session: r.session_id
          ? { id: r.session_id, title: r.session_title ?? '', heldOn: day(r.session_on!) }
          : null,
        thin: { phone: !r.phone, area: !r.area },
      })),
    };
  }

  /**
   * Saved on the doorstep is saved in Membership too, as when the office
   * marks it: a visitor becomes a new convert, so the person's stage and
   * timeline agree in every portal. Someone already marked saved is left as
   * they are, and the office can still correct it.
   */
  private async markSaved(tx: Tx, personId: string) {
    const person = await tx.person.findUniqueOrThrow({ where: { id: personId } });
    if (person.saved === true) return;
    await tx.person.update({
      where: { id: personId },
      data: { saved: true, savedSetById: this.auth.userId, savedSetAt: new Date() },
    });
    if (person.stage === 'VISITOR') {
      await moveStage(
        tx,
        person,
        'NEW_CONVERT',
        this.auth.userId,
        'Gave their life to Christ when Outreach reached them',
      );
    }
  }

  /**
   * Where and when, and by whom. A team brings all three: its Saturday, its
   * area, its people, so on the day only the name, the number and the tick
   * are typed.
   */
  private async where(tx: Tx, input: ReachedInput) {
    let sessionId = input.sessionId ?? null;
    let area = input.area?.trim() ?? '';
    let reachedByIds = input.reachedByIds;
    let reachedOn = input.reachedOn ?? null;
    let sessionTeam: Set<string> = new Set();

    if (input.teamId) {
      const team = await tx.outreachSessionTeam.findUnique({
        where: { id: input.teamId },
        include: { session: true, members: { select: { personId: true } } },
      });
      if (!team || (sessionId && team.sessionId !== sessionId)) {
        throw notFound('No such team on that Saturday.');
      }
      sessionId = team.sessionId;
      area ||= team.area;
      sessionTeam = new Set(team.members.map((m) => m.personId));
      reachedByIds ??= [...sessionTeam];
    }
    if (sessionId) {
      const session = await tx.outreachSession.findUnique({ where: { id: sessionId } });
      if (!session) throw notFound('No such Saturday.');
      if (session.status === 'CANCELLED') {
        throw new AppError(409, ErrorCode.CONFLICT, 'That Saturday was cancelled.');
      }
      reachedOn = day(session.heldOn);
    }
    reachedOn ??= await today(tx);
    if (reachedOn > (await today(tx))) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        sessionId
          ? 'That Saturday has not come yet. Record people on the day, or after it.'
          : 'That date is in the future.',
        { reachedOn: ['Not later than today'] },
      );
    }

    // Who reached them: the Saturday's team, or anyone on the Outreach team now.
    reachedByIds = [...new Set(reachedByIds ?? [])];
    if (reachedByIds.length) {
      const department = await this.team.department(tx);
      const onTeam = await this.team.teamIds(tx, department.id);
      if (reachedByIds.some((id) => !onTeam.has(id) && !sessionTeam.has(id))) {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_FAILED,
          'Whoever reached them must be on the Outreach team.',
          { reachedByIds: ['Not on the team'] },
        );
      }
    }
    return { sessionId, teamId: input.teamId ?? null, area, reachedByIds, reachedOn };
  }

  /**
   * The person reached: the one the recorder said it was, or a new one —
   * but only once nobody already known looks like them.
   */
  private async person(tx: Tx, input: ReachedInput) {
    const phone = input.phone.replace(/[^\d+]/g, '');
    if (input.samePersonId) {
      const known = await tx.person.findUnique({ where: { id: input.samePersonId } });
      if (!known) throw notFound('That person is no longer in People.');
      // Consent only ever turns messages off for someone already known (D22).
      if (!input.mayMessage && !known.smsOptOut) {
        await tx.person.update({
          where: { id: known.id },
          data: { smsOptOut: true, smsOptOutAt: new Date(), smsOptOutSource: 'outreach' },
        });
      }
      return { id: known.id, fullName: known.fullName, known: true };
    }

    if (!input.notSamePerson) {
      const candidates = await this.matches(tx, input.fullName, input.dial, phone);
      if (candidates.length) {
        const first = candidates[0]!;
        throw new AppError(
          409,
          ErrorCode.POSSIBLE_MATCH,
          `${first.name}${first.last ? `, ${first.last}` : ''}. Same person?`,
          { candidates },
        );
      }
    }

    const lang = input.lang ?? (await commsSettings(tx)).defaultLang;
    const created = await tx.person.create({
      data: {
        fullName: input.fullName.trim(),
        dial: input.dial,
        phone: phone.startsWith('+') ? phone : phone.replace(/\D/g, ''),
        lang,
        source: 'OUTREACH',
        stage: 'VISITOR',
        createdById: this.auth.userId,
        ...(input.mayMessage
          ? {}
          : { smsOptOut: true, smsOptOutAt: new Date(), smsOptOutSource: 'outreach' }),
      },
    });
    return { id: created.id, fullName: created.fullName, known: false };
  }

  /**
   * People who may be this one: the same phone number, or — only when no
   * number was given — a close name. Each is said in the fewest words that
   * let the recorder tell: name, and when and where they were last reached
   * or registered. Nothing else about them.
   */
  async matches(tx: Tx, fullName: string, dial: string, phone: string) {
    const key = phoneKey(dial, phone);
    const rows = key
      ? await tx.$queryRaw<{ id: string; full_name: string }[]>(sql`
          select p.id, p.full_name from people p
          where p.phone <> '' and ${PERSON_PHONE_KEY} = ${key}
          order by p.created_at
          limit 5`)
      : await tx.$queryRaw<{ id: string; full_name: string }[]>(sql`
          select p.id, p.full_name from people p
          where similarity(lower(p.full_name), lower(${fullName.trim()})) >= ${SIMILAR_NAME}
          order by similarity(lower(p.full_name), lower(${fullName.trim()})) desc, p.created_at
          limit 5`);
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const [reaches, people] = await Promise.all([
      tx.outreachReached.findMany({
        where: { personId: { in: ids } },
        orderBy: { reachedOn: 'desc' },
        select: { personId: true, reachedOn: true, area: true },
      }),
      tx.person.findMany({
        where: { id: { in: ids } },
        select: { id: true, createdAt: true, registration: { select: { createdAt: true } } },
      }),
    ]);
    const short = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return rows.map((r) => {
      const reach = reaches.find((x) => x.personId === r.id);
      const person = people.find((x) => x.id === r.id)!;
      const last = reach
        ? `reached ${short(reach.reachedOn)}${reach.area ? ` in ${reach.area}` : ''}`
        : `registered ${short(person.registration?.createdAt ?? person.createdAt)}`;
      return { personId: r.id, name: r.full_name, last };
    });
  }
}

/** Today where the church is: a Saturday evening in Arusha is not Sunday in London. */
export async function today(tx: Pick<Tx, 'church'>): Promise<string> {
  const church = await tx.church.findUnique({ where: { id: 1 }, select: { timezone: true } });
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: church?.timezone ?? 'Africa/Dar_es_Salaam',
  }).format(new Date());
}

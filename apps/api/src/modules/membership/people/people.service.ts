import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { JOINING, SERVING, t, UI, type Lang } from '@irca/shared/registration';
import type { PersonNoteKind, PersonStage } from '../../../generated/prisma/client.js';
import { Db } from '../../../core/database/db.service.js';
import { empty, identifier, join, sql, type Sql } from '../../../core/database/sql.js';
import { RequestAuth } from '../../../core/context/request-auth.js';
import { AppError } from '../../../core/http/app-error.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { UsageService } from '../../../core/usage/usage.service.js';
import { AppConfig } from '../../../config/app-config.js';
import { checkManualMove, moveStage } from '../journey.js';
import { readTimeline, recordInteraction } from '../timeline.js';
import { toPersonDetail, toPersonRow, type PersonRow } from './person.dto.js';

export const TABS = [
  'all',
  'joining',
  'salvation',
  'baptism',
  'volunteers',
  'new_converts',
  'incomplete',
] as const;
export type Tab = (typeof TABS)[number];

export type PeopleQuery = {
  tab?: Tab;
  q?: string;
  salvation?: 'saved' | 'not';
  baptism?: 'baptised' | 'not';
  gender?: string;
  age?: string;
  lives?: 'arusha' | 'region' | 'country';
  source?: string;
  page?: number;
  pageSize?: number;
};

// The office's word, then the form's, then no.
const SAVED = sql`coalesce(p.saved, r.saved, false)`;
const BAPTISED = sql`coalesce(p.baptised, r.bapt, false)`;

/** Each tab as a condition, so the list and the counts use one definition. */
const TAB_SQL: Record<Tab, Sql> = {
  all: sql`true`,
  joining: sql`${JOINING} = any(coalesce(r.interest, '{}'))`,
  salvation: SAVED,
  baptism: BAPTISED,
  volunteers: sql`${SERVING} = any(coalesce(r.interest, '{}'))`,
  new_converts: sql`${SAVED} and not ${BAPTISED}`,
  incomplete: sql`r.status = 'in_progress'`,
};

/**
 * The people the church is caring for.
 *
 * Filtering is SQL rather than Prisma because nearly every filter is about
 * the form's answers, and two of them — saved and baptised — are "the office's
 * word if it has given one, otherwise what the person said", which is a
 * coalesce across two tables. Every query pins the church itself as well as
 * running under row-level security.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly config: AppConfig,
  ) {}

  private get canReadSensitive() {
    return this.auth.has('membership.people.read_sensitive');
  }

  async list(query: PeopleQuery) {
    const where = this.filters(query);
    const tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'all';
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const page = Math.max(1, query.page ?? 1);

    const ids = await this.query<{ id: string }>(
      sql`       select p.id from people p
       left join registrations r on r.id = p.registration_id
       where ${where} and ${TAB_SQL[tab]}
       -- Unfinished ones first, as the office list always had it, then newest.
       order by (r.status = 'in_progress') desc nulls last,
                coalesce(r.updated_at, p.updated_at) desc
       limit ${pageSize} offset ${(page - 1) * pageSize}`,
    );

    const counts = await this.query<Record<Tab, number>>(
      sql`       select ${join(
        TABS.map((key) => sql`count(*) filter (where ${TAB_SQL[key]})::int as ${identifier(key)}`),
        ', ',
      )}
       from people p
       left join registrations r on r.id = p.registration_id
       where ${where}`,
    );

    const people = await this.db.client.person.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: { registration: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    const tabCounts = counts[0] ?? ({} as Record<Tab, number>);

    return {
      rows: ids.map((r) => toPersonRow(byId.get(r.id)!)),
      total: tabCounts[tab] ?? 0,
      tabCounts,
    };
  }

  /** Every filter but the tab, as SQL, so the tab counts can share it. */
  private filters(query: PeopleQuery): Sql {
    const clauses: Sql[] = [];

    const q = query.q?.trim();
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      // Email only for people who may see it: searching by it would otherwise
      // tell someone whose address it is.
      clauses.push(
        sql`(lower(p.full_name) like ${like} or (p.dial || p.phone) like ${like}
             or p.phone like ${like}
             ${this.canReadSensitive ? sql`or lower(p.email) like ${like}` : empty})`,
      );
    }
    if (query.salvation === 'saved') clauses.push(SAVED);
    if (query.salvation === 'not') clauses.push(sql`not ${SAVED}`);
    if (query.baptism === 'baptised') clauses.push(BAPTISED);
    if (query.baptism === 'not') clauses.push(sql`not ${BAPTISED}`);
    if (query.gender) clauses.push(sql`p.gender = ${query.gender}`);
    if (query.age) clauses.push(sql`p.age_group = ${query.age}`);
    if (query.lives) clauses.push(sql`r.where_at = ${query.lives}`);
    if (query.source) clauses.push(sql`${query.source} = any(coalesce(r.heard, '{}'))`);

    // The church clause used to be here and was always true, so the list was
    // never empty. With no filters at all, everyone matches.
    return clauses.length ? join(clauses, ' and ') : sql`true`;
  }

  async get(id: string) {
    const person = await this.require(id);
    const [events, notes] = await Promise.all([
      this.db.client.personStageEvent.findMany({
        where: { personId: id },
        orderBy: { at: 'desc' },
        take: 50,
      }),
      this.canReadSensitive
        ? this.db.client.personNote.findMany({
            where: { personId: id },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : Promise.resolve(null),
    ]);
    const names = await this.names([
      ...events.map((e) => e.byId),
      ...(notes ?? []).map((n) => n.authorId),
      person.savedSetById,
      person.baptisedSetById,
    ]);

    return {
      ...toPersonDetail(person, this.canReadSensitive),
      savedBy: person.savedSetById ? (names.get(person.savedSetById) ?? null) : null,
      baptisedBy: person.baptisedSetById ? (names.get(person.baptisedSetById) ?? null) : null,
      memberNumber: person.memberNumber,
      history: events.map((e) => ({
        at: e.at.toISOString(),
        from: e.fromStage,
        to: e.toStage,
        by: e.byId ? (names.get(e.byId) ?? 'Someone') : 'The system',
        note: e.note,
      })),
      // Absent, not empty, for anyone who may not read them.
      ...(notes && {
        notes: notes.map((n) => ({
          id: n.id,
          kind: n.kind,
          body: n.body,
          at: n.createdAt.toISOString(),
          by: names.get(n.authorId) ?? 'Someone',
        })),
      }),
    };
  }

  /** Someone who never filled in the form, typed in by the office. */
  async timeline(id: string) {
    await this.require(id);
    return readTimeline(this.db.client, id);
  }

  async add(input: {
    fullName: string;
    gender?: string;
    ageGroup?: string;
    dial?: string;
    phone?: string;
    email?: string;
  }) {
    const created = await this.db.tx(async (tx) => {
      const person = await tx.person.create({
        data: {
          fullName: input.fullName.trim(),
          gender: input.gender ?? '',
          ageGroup: input.ageGroup ?? '',
          dial: input.dial ?? '+255',
          phone: input.phone?.replace(/\D/g, '') ?? '',
          email: input.email?.trim().toLowerCase() ?? '',
          createdById: this.auth.userId,
        },
      });
      await this.audit.recordIn(tx, {
        action: 'membership.person.added',
        entityType: 'person',
        entityId: person.id,
        summary: `Added ${person.fullName} by hand`,
      });
      return person;
    });
    this.usage.inc('membership.people.added');
    return { id: created.id };
  }

  /**
   * The office confirms, or corrects, what the form said. `null` hands it back
   * to the form, which is different from `false`: "we have not checked" is
   * not "no".
   */
  async setFlag(id: string, flag: 'saved' | 'baptised', value: boolean | null): Promise<void> {
    const person = await this.require(id);
    await this.db.tx(async (tx) => {
      await tx.person.update({
        where: { id },
        data:
          flag === 'saved'
            ? { saved: value, savedSetById: this.auth.userId, savedSetAt: new Date() }
            : { baptised: value, baptisedSetById: this.auth.userId, baptisedSetAt: new Date() },
      });
      // A visitor who is now saved is a new convert: that is the next step, and
      // the board should show it without anyone dragging a card.
      if (flag === 'saved' && value === true && person.stage === 'VISITOR') {
        await moveStage(tx, person, 'NEW_CONVERT', this.auth.userId, 'Marked saved');
      }
      await this.audit.recordIn(tx, {
        action: `membership.person.${flag}`,
        entityType: 'person',
        entityId: id,
        summary: `${value === null ? 'Went back to the form for' : value ? 'Marked' : 'Unmarked'} ${flag} for ${person.fullName || 'someone'}`,
      });
    });
  }

  async move(id: string, to: PersonStage, note?: string): Promise<void> {
    const person = await this.require(id);
    checkManualMove(person.stage, to, note);
    await this.db.tx(async (tx) => {
      await moveStage(tx, person, to, this.auth.userId, note);
      await this.audit.recordIn(tx, {
        action: 'membership.person.moved',
        entityType: 'person',
        entityId: id,
        summary: `Moved ${person.fullName || 'someone'} from ${words(person.stage)} to ${words(to)}`,
      });
    });
  }

  async addNote(id: string, kind: PersonNoteKind, body: string) {
    const person = await this.require(id);
    const note = await this.db.tx(async (tx) => {
      const created = await tx.personNote.create({
        data: { personId: id, kind, body, authorId: this.auth.userId! },
      });
      // A call or a visit is on their timeline for everyone who may see them;
      // what was written stays here, behind the sensitive permission.
      if (kind !== 'NOTE') {
        await recordInteraction(tx, {
          personId: id,
          kind,
          moduleKey: 'membership',
          byId: this.auth.userId,
          summary: kind === 'CALL' ? 'Phone call' : 'Home visit',
          meta: { noteId: created.id },
        });
      }
      await this.audit.recordIn(tx, {
        action: 'membership.note.added',
        entityType: 'person',
        entityId: id,
        // The note itself stays out of the log: it is as private as the rest.
        summary: `Logged a ${kind.toLowerCase()} for ${person.fullName || 'someone'}`,
      });
      return created;
    });
    return { id: note.id };
  }

  /**
   * The language they are written to in, and whether they want messages. The
   * office turning messages off is recorded as the office's doing; turning
   * them back on is the office's too, and is written down, because it undoes
   * what may have been someone's own request.
   */
  async setMessaging(id: string, input: { lang: string; optOut: boolean }) {
    const person = await this.require(id);
    await this.db.tx(async (tx) => {
      await tx.person.update({
        where: { id },
        data: {
          lang: input.lang,
          smsOptOut: input.optOut,
          ...(input.optOut && !person.smsOptOut
            ? { smsOptOutAt: new Date(), smsOptOutSource: 'office' }
            : {}),
          ...(!input.optOut ? { smsOptOutAt: null, smsOptOutSource: null } : {}),
        },
      });
      const changes = [
        person.lang !== input.lang && `language ${person.lang} → ${input.lang}`,
        person.smsOptOut !== input.optOut && (input.optOut ? 'no messages' : 'messages back on'),
      ].filter(Boolean);
      if (changes.length) {
        await this.audit.recordIn(tx, {
          action: 'membership.person.messaging',
          entityType: 'person',
          entityId: id,
          summary: `Changed how ${person.fullName || 'someone'} is messaged: ${changes.join(', ')}`,
        });
      }
    });
  }

  /** Their own link, and a WhatsApp message to send it with, in their language. */
  async registrationLink(id: string) {
    const person = await this.require(id);
    const registration = person.registration;
    if (!registration) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'They were added by hand and have no form.');
    }
    const url = `${this.config.get('REGISTRATION_ORIGIN')}/r/${registration.token}`;
    const message = t(UI.remind, registration.lang as Lang)
      .replace('{name}', person.fullName.split(' ')[0] ?? '')
      .replace(' ,', ',')
      .replace('{link}', url);
    const digits = `${person.dial}${person.phone}`.replace(/\D/g, '');
    return {
      url,
      message,
      whatsappUrl: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null,
    };
  }

  /** That someone was sent their link, and how. */
  async recordReminder(id: string, channel: 'COPY_LINK' | 'WHATSAPP'): Promise<void> {
    const person = await this.require(id);
    if (!person.registration) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'They were added by hand and have no form.');
    }
    await this.db.client.registrationReminder.create({
      data: {
        registrationId: person.registration.id,
        channel,
        sentById: this.auth.userId!,
      },
    });
    this.usage.inc('membership.reminders.sent');
  }

  /** Everything matching the filters, for the CSV. */
  async all(query: PeopleQuery): Promise<{ rows: PersonRow[]; sensitive: boolean }> {
    const { rows } = await this.list({ ...query, page: 1, pageSize: 100 });
    // A CSV is a page at a time here; exporting thousands would page on.
    let all = rows;
    for (let page = 2; rows.length === 100 && page < 200; page++) {
      const next = await this.list({ ...query, page, pageSize: 100 });
      all = all.concat(next.rows);
      if (next.rows.length < 100) break;
    }
    return { rows: all, sensitive: this.canReadSensitive };
  }

  private async require(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person.');
    const person = await this.db.client.person.findFirst({
      where: { id },
      include: { registration: true },
    });
    if (!person) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person.');
    return person;
  }

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter(Boolean))] as string[];
    if (!wanted.length) return new Map();
    const users = await this.db.client.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  /** Raw SQL through a transaction, which is what tells Postgres the church. */
  private query<T>(query: Sql): Promise<T[]> {
    return this.db.tx((tx) => tx.$queryRaw<T[]>(query));
  }
}

const words = (stage: PersonStage) => stage.toLowerCase().replaceAll('_', ' ');

import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { Db } from '../../core/database/db.service.js';
import { sql, type Sql } from '../../core/database/sql.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { today } from './reached.service.js';

export type Period = { from: string; to: string };

/**
 * One figure: the rows behind it, as SQL, and how they add up. Every row has
 * the same columns — id, title, detail, at_day, href — plus `n`, what it
 * counts for (1, or a team's spoken-to number, or a training's attended),
 * and `d`, what it is out of, for the one figure that is a rate.
 *
 * The number on the dashboard is the sum of `n` over exactly these rows, and
 * the list it opens is these rows, so the two cannot disagree: a number that
 * cannot be opened is a number nobody trusts (08 step 8.8).
 */
type Figure = {
  label: string;
  /** Said under the number: how it is counted, in plain words. */
  hint: string;
  /** A rate shows sum(n) of sum(d); everything else shows sum(n). */
  rate?: boolean;
  /** Not bound to the period: how things stand now. */
  now?: boolean;
  /** Drawn by week on the trends chart. */
  trend?: boolean;
  rows: (p: Period, tz: string) => Sql;
};

const person = (id: Sql) => sql`'/outreach/people/' || ${id}::text`;
const local = (at: Sql, tz: string) => sql`(${at} at time zone ${tz})::date`;

export const FIGURES = {
  reached: {
    label: 'People reached',
    hint: 'Recorded on a Saturday or since, each time they were reached',
    trend: true,
    rows: ({ from, to }) => sql`
      select r.id::text as id, p.full_name as title,
             concat_ws(' · ', nullif(r.area, ''), nullif(s.title, '')) as detail,
             r.reached_on as at_day, ${person(sql`p.id`)} as href, 1 as n, 1 as d
      from outreach_reached r
      join people p on p.id = r.person_id
      left join outreach_sessions s on s.id = r.session_id
      where r.reached_on between ${from}::date and ${to}::date`,
  },
  spokenTo: {
    label: 'Spoken to, no details',
    hint: 'Typed by each team, for people spoken to without taking details',
    trend: true,
    rows: ({ from, to }) => sql`
      select t.id::text as id, t.area as title,
             coalesce(nullif(s.title, ''), 'Saturday') as detail,
             s.held_on as at_day, '/outreach/sessions/' || s.id::text as href,
             t.spoken_to_only as n, 1 as d
      from outreach_session_teams t
      join outreach_sessions s on s.id = t.session_id
      where s.status <> 'CANCELLED' and t.spoken_to_only > 0
        and s.held_on between ${from}::date and ${to}::date`,
  },
  awaiting: {
    label: 'Awaiting follow-up',
    hint: 'People with a reach still marked as needing following up, now',
    now: true,
    rows: () => sql`
      select p.id::text as id, p.full_name as title,
             'Reached ' || to_char(min(r.reached_on), 'FMDD Mon YYYY') as detail,
             min(r.reached_on) as at_day, ${person(sql`p.id`)} as href, 1 as n, 1 as d
      from outreach_reached r
      join people p on p.id = r.person_id
      where r.needs_follow_up
      group by p.id, p.full_name`,
  },
  followups: {
    label: 'Follow-ups done',
    hint: 'Calls, visits and invitations recorded by Outreach',
    trend: true,
    rows: ({ from, to }, tz) => sql`
      select i.id::text as id, p.full_name as title, i.summary as detail,
             ${local(sql`i.at`, tz)} as at_day, ${person(sql`p.id`)} as href, 1 as n, 1 as d
      from person_interactions i
      join people p on p.id = i.person_id
      where i.module_key = 'outreach' and i.kind in ('CALL', 'VISIT', 'INVITED')
        and ${local(sql`i.at`, tz)} between ${from}::date and ${to}::date`,
  },
  visited: {
    label: 'People visited',
    hint: 'Different people Outreach visited at home',
    rows: ({ from, to }, tz) => sql`
      select p.id::text as id, p.full_name as title,
             count(*) || case when count(*) = 1 then ' visit' else ' visits' end as detail,
             max(${local(sql`i.at`, tz)}) as at_day, ${person(sql`p.id`)} as href, 1 as n, 1 as d
      from person_interactions i
      join people p on p.id = i.person_id
      where i.module_key = 'outreach' and i.kind = 'VISIT'
        and ${local(sql`i.at`, tz)} between ${from}::date and ${to}::date
      group by p.id, p.full_name`,
  },
  firstTime: {
    label: 'First-time attenders',
    hint: 'People Outreach reached who came to church for the first time',
    trend: true,
    rows: ({ from, to }, tz) => sql`
      with first as (
        select person_id, min(at) as at from person_interactions
        where kind = 'ATTENDED_SERVICE' group by person_id
      )
      select p.id::text as id, p.full_name as title,
             'Reached ' || to_char(min(${local(sql`e.at`, tz)}), 'FMDD Mon YYYY') as detail,
             ${local(sql`f.at`, tz)} as at_day, ${person(sql`p.id`)} as href, 1 as n, 1 as d
      from first f
      join people p on p.id = f.person_id
      join person_interactions e on e.person_id = f.person_id
        and e.kind = 'EVANGELISED' and e.at <= f.at
      where ${local(sql`f.at`, tz)} between ${from}::date and ${to}::date
      group by p.id, p.full_name, f.at`,
  },
  sessions: {
    label: 'Saturdays held',
    hint: 'Saturdays marked completed',
    rows: ({ from, to }) => sql`
      select s.id::text as id, coalesce(nullif(s.title, ''), 'Saturday') as title,
             coalesce(string_agg(t.area, ', ' order by t.area), 'No teams') as detail,
             s.held_on as at_day, '/outreach/sessions/' || s.id::text as href, 1 as n, 1 as d
      from outreach_sessions s
      left join outreach_session_teams t on t.session_id = s.id
      where s.status = 'COMPLETED' and s.held_on between ${from}::date and ${to}::date
      group by s.id`,
  },
  areas: {
    label: 'Areas covered',
    hint: 'Different areas teams were sent to',
    rows: ({ from, to }) => sql`
      select min(t.area) as id, min(t.area) as title,
             count(*) || case when count(*) = 1 then ' team' else ' teams' end as detail,
             max(s.held_on) as at_day,
             '/outreach/sessions?from=' || ${from} || '&to=' || ${to} as href, 1 as n, 1 as d
      from outreach_session_teams t
      join outreach_sessions s on s.id = t.session_id
      where s.status <> 'CANCELLED' and s.held_on between ${from}::date and ${to}::date
      group by lower(trim(t.area))`,
  },
  participation: {
    label: 'Team members out',
    hint: 'Different people on a Saturday team, with how many Saturdays each',
    rows: ({ from, to }) => sql`
      select p.id::text as id, p.full_name as title,
             count(distinct s.id) || case when count(distinct s.id) = 1
               then ' Saturday' else ' Saturdays' end as detail,
             max(s.held_on) as at_day, '/outreach/team' as href, 1 as n, 1 as d
      from outreach_session_team_members m
      join outreach_session_teams t on t.id = m.team_id
      join outreach_sessions s on s.id = t.session_id
      join people p on p.id = m.person_id
      where s.status <> 'CANCELLED' and s.held_on between ${from}::date and ${to}::date
      group by p.id, p.full_name`,
  },
  training: {
    label: 'Training attendance',
    hint: 'Marked present, out of everyone marked, at trainings held',
    rate: true,
    rows: ({ from, to }, tz) => sql`
      select tr.id::text as id, tr.topic as title,
             count(*) filter (where a.mark = 'ATTENDED') || ' of ' || count(*) || ' came' as detail,
             ${local(sql`tr.held_at`, tz)} as at_day,
             '/outreach/training/' || tr.id::text as href,
             count(*) filter (where a.mark = 'ATTENDED')::int as n, count(*)::int as d
      from outreach_trainings tr
      join outreach_training_attendance a on a.training_id = tr.id
      where ${local(sql`tr.held_at`, tz)} between ${from}::date and ${to}::date
      group by tr.id`,
  },
} satisfies Record<string, Figure>;

export type FigureKey = keyof typeof FIGURES;
export const FIGURE_KEYS = Object.keys(FIGURES) as FigureKey[];

type Row = {
  id: string;
  title: string;
  detail: string | null;
  at_day: Date | null;
  href: string;
  n: number;
  d: number;
};

/** A year and a bit: enough for "this year", not enough to scan everything by accident. */
const MAX_DAYS = 400;

/**
 * The numbers the Outreach leader reports upward (08 step 8.8), for any
 * period, each one opening the list behind it. Computed in SQL from the
 * figures above, never kept.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly db: Db) {}

  async dashboard(query: Partial<Period>) {
    const { period, tz } = await this.period(query);
    const entries = await Promise.all(
      FIGURE_KEYS.map(async (key) => {
        const figure: Figure = FIGURES[key];
        const [total] = await this.db.client.$queryRaw<{ n: number; d: number }[]>(sql`
          select coalesce(sum(n), 0)::int as n, coalesce(sum(d), 0)::int as d
          from (${figure.rows(period, tz)}) x`);
        return [
          key,
          {
            label: figure.label,
            hint: figure.hint,
            value: total?.n ?? 0,
            of: figure.rate ? (total?.d ?? 0) : null,
            now: figure.now ?? false,
          },
        ] as const;
      }),
    );
    return {
      ...period,
      figures: Object.fromEntries(entries),
      trends: await this.trends(period, tz),
    };
  }

  /** The list behind one figure: exactly the rows its number adds up. */
  async list(key: string, query: Partial<Period>) {
    if (!FIGURE_KEYS.includes(key as FigureKey)) throw notFound('No such figure.');
    const figure: Figure = FIGURES[key as FigureKey];
    const { period, tz } = await this.period(query);
    const rows = await this.db.client.$queryRaw<Row[]>(sql`
      select * from (${figure.rows(period, tz)}) x
      order by at_day desc nulls last, title
      limit 2000`);
    return {
      ...period,
      key,
      label: figure.label,
      hint: figure.hint,
      now: figure.now ?? false,
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        detail: r.detail ?? '',
        day: r.at_day ? r.at_day.toISOString().slice(0, 10) : null,
        href: r.href,
        n: r.n,
        d: r.d,
      })),
    };
  }

  /** The figures that move week to week, by the Monday each week starts on. */
  private async trends(period: Period, tz: string) {
    const keys = FIGURE_KEYS.filter((k) => (FIGURES[k] as Figure).trend);
    const weeks = await this.db.client.$queryRaw<{ week: Date }[]>(sql`
      select generate_series(date_trunc('week', ${period.from}::date),
                             ${period.to}::date, interval '1 week')::date as week`);
    const series = await Promise.all(
      keys.map(async (key) => {
        const rows = await this.db.client.$queryRaw<{ week: Date; n: number }[]>(sql`
          select date_trunc('week', at_day)::date as week, sum(n)::int as n
          from (${(FIGURES[key] as Figure).rows(period, tz)}) x
          group by 1`);
        const byWeek = new Map(rows.map((r) => [r.week.toISOString().slice(0, 10), r.n]));
        return {
          metric: key,
          label: FIGURES[key].label,
          points: weeks.map((w) => {
            const day = w.week.toISOString().slice(0, 10);
            return { day, value: byWeek.get(day) ?? 0 };
          }),
        };
      }),
    );
    return series;
  }

  /** The period asked for, or this month so far, in church time. */
  private async period(query: Partial<Period>) {
    const church = await this.db.client.church.findUnique({
      where: { id: 1 },
      select: { timezone: true },
    });
    const tz = church?.timezone ?? 'Africa/Dar_es_Salaam';
    const now = await today(this.db.client);
    const to = query.to ?? now;
    const from = query.from ?? `${to.slice(0, 8)}01`;
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0 || days > MAX_DAYS) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        days < 0 ? 'The period ends before it starts.' : 'Choose a period of a year or less.',
        { from: ['Check the dates'] },
      );
    }
    return { period: { from, to }, tz };
  }
}

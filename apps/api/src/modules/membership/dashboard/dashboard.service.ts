import { Injectable } from '@nestjs/common';
import { initialsOf } from '@irca/shared';
import {
  JOINING,
  applicableSteps,
  computeInsights,
  isAnswered,
  t,
  type Lang,
  type Registration as FormRegistration,
} from '@irca/shared/registration';
import type { Registration } from '../../../generated/prisma/client.js';
import { Db } from '../../../core/database/db.service.js';
import { RequestAuth } from '../../../core/context/request-auth.js';
import { valuesOf } from '../public-registration/values.js';
import { livesIn } from '../people/person.dto.js';
import { setting } from '../settings.js';

const DAY = 86_400_000;

type Period = '90d' | 'year' | 'all';

/**
 * The Membership dashboard and Insights.
 *
 * Every number here is a count first and a percentage second, never a bare
 * percentage: at a couple of dozen visitors a Sunday, "50%" can mean one
 * person, and the old office report learned that the hard way.
 *
 * Registrations are read into memory and counted in code, which is what the
 * old report did and is right up to tens of thousands of rows. Past that,
 * move the counts into SQL (group by over the text[] columns with unnest).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
  ) {}

  async dashboard() {
    const now = Date.now();
    const since = new Date(now - 30 * DAY);
    const before = new Date(now - 60 * DAY);

    const registrations = await this.db.client.registration.findMany({ where: {} });
    const people = await this.db.client.person.findMany({
      where: {},
      select: { id: true, saved: true, baptised: true, registrationId: true, createdAt: true },
    });
    const personByReg = new Map(people.map((p) => [p.registrationId, p]));

    const stat = (test: (r: Registration) => boolean) => {
      const all = registrations.filter(test);
      const recent = all.filter((r) => r.createdAt >= since).length;
      const previous = all.filter((r) => r.createdAt >= before && r.createdAt < since).length;
      return { total: all.length, last30: recent, delta: recent - previous };
    };
    const saved = (r: Registration) => personByReg.get(r.id)?.saved ?? r.saved ?? false;
    const baptised = (r: Registration) => personByReg.get(r.id)?.baptised ?? r.bapt ?? false;

    const month = new Date();
    month.setUTCDate(1);
    month.setUTCHours(0, 0, 0, 0);

    const incomplete = registrations
      .filter((r) => r.status === 'in_progress')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return {
      stats: {
        registrations: stat(() => true),
        joining: stat((r) => r.interest.includes(JOINING)),
        salvation: stat(saved),
        baptism: stat(baptised),
        thisMonth: registrations.filter((r) => r.createdAt >= month).length,
      },
      applications: this.auth.has('membership.applications.read')
        ? await this.openApplications()
        : null,
      followUp: this.auth.has('membership.discipleship.read')
        ? await this.newConverts()
        : null,
      heard: tally(registrations.flatMap((r) => r.heard)),
      heardOtherCount: registrations.filter((r) => r.heardOtherText.trim()).length,
      incomplete: {
        total: incomplete.length,
        rows: incomplete.slice(0, 4).map((r) => {
          const values = valuesOf(r);
          const lang = r.lang as Lang;
          const missing = applicableSteps(values)
            .filter((step) => !isAnswered(step, values, lang))
            .map((step) => t(step.short, 'en'))
            .slice(0, 3);
          return {
            personId: personByReg.get(r.id)?.id ?? null,
            name: r.fullname.trim() || null,
            phone: r.phone ? `${r.dial} ${r.phone}` : null,
            missing,
            updatedAt: r.updatedAt.toISOString(),
          };
        }),
      },
    };
  }

  async insights(period: Period) {
    const from =
      period === '90d'
        ? new Date(Date.now() - 90 * DAY)
        : period === 'year'
          ? new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))
          : null;
    const rows = await this.db.client.registration.findMany({
      where: { ...(from ? { createdAt: { gte: from } } : {}) },
    });

    // The shared report the old office screen used, now per church and period.
    const forReport: FormRegistration[] = rows.map((r) => ({
      id: r.id,
      token: r.token,
      lang: r.lang as Lang,
      status: r.status as 'in_progress' | 'submitted',
      currentStep: r.currentStep,
      furthestStep: r.furthestStep,
      values: valuesOf(r),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      submittedAt: r.submittedAt,
    }));
    const report = computeInsights(forReport, 'en');

    return {
      period,
      total: rows.length,
      report,
      heard: tally(rows.flatMap((r) => r.heard)),
      // Typed "Other" answers, grouped so "a friend", "A Friend." and "friend "
      // count as one.
      heardOther: grouped(rows.map((r) => r.heardOtherText)),
      ages: tally(rows.map((r) => r.age).filter(Boolean)),
      livesIn: tally(rows.map((r) => livesIn(valuesOf(r))).filter(Boolean)),
      cameFor: tally(rows.flatMap((r) => r.visit)),
      interestedIn: tally(rows.flatMap((r) => r.interest)),
    };
  }

  private async openApplications() {
    const rows = await this.db.client.membershipApplication.findMany({
      where: { status: 'UNDER_REVIEW' },
      orderBy: { submittedAt: 'desc' },
      take: 3,
      include: { person: true },
    });
    const total = await this.db.client.membershipApplication.count({
      where: { status: 'UNDER_REVIEW' },
    });
    return {
      total,
      rows: rows.map((a) => ({
        id: a.id,
        personId: a.personId,
        fullName: a.person.fullName || 'Unknown',
        initials: a.person.fullName ? initialsOf(a.person.fullName) : '?',
        submittedAt: a.submittedAt.toISOString(),
        source: a.source,
      })),
    };
  }

  private async newConverts() {
    const sessions = await this.db.tx((tx) =>
      setting(tx, 'membership.foundationSessions'),
    );
    const people = await this.db.client.person.findMany({
      where: { stage: { in: ['NEW_CONVERT', 'FOUNDATION_CLASS'] } },
      orderBy: { updatedAt: 'desc' },
      take: 4,
      include: {
        enrollments: {
          where: { droppedAt: null },
          orderBy: { enrolledAt: 'desc' },
          take: 1,
          include: { group: true, attendance: true },
        },
      },
    });
    return people.map((p) => {
      const enrollment = p.enrollments[0];
      return {
        personId: p.id,
        fullName: p.fullName || 'Unknown',
        initials: p.fullName ? initialsOf(p.fullName) : '?',
        savedAt: p.savedSetAt?.toISOString() ?? null,
        group: enrollment?.group.name ?? null,
        progress: enrollment
          ? {
              attended: enrollment.attendance.filter((a) => a.mark === 'ATTENDED').length,
              of: sessions,
            }
          : null,
      };
    });
  }
}

/** Counts, biggest first, with the share each is of the whole. */
function tally(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const total = values.length;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      share: total ? Math.round((count / total) * 100) : 0,
    }));
}

/** Free text, grouped by what it says rather than how it was typed. */
function grouped(texts: string[]) {
  const groups = new Map<string, { label: string; count: number }>();
  for (const text of texts) {
    const key = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key) continue;
    const group = groups.get(key) ?? { label: text.trim(), count: 0 };
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

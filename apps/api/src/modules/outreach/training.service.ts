import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import type { AttendanceMark } from '../../generated/prisma/client.js';
import { Db, type Tx } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { atWall, wallClock } from '../../core/comms/next-run.js';
import { recordInteraction } from '../membership/timeline.js';
import { TeamService } from './team.service.js';

export type TrainingInput = {
  topic: string;
  trainer?: string;
  /** Church time: '2026-09-25' and '18:00'. */
  date: string;
  time: string;
  venue?: string;
  notes?: string;
};
export type Mark = { personId: string; mark: AttendanceMark | null };

/** How many trainings the history and the team page look back over. */
export const HISTORY = 12;

/**
 * Friday training: the topic, who taught it, where and when, and who came.
 *
 * Marked with the same marks as the foundation class register. Each person
 * marked present gets a line on their timeline, once per training however
 * often the mark changes: a tick taken back stays written, as the class
 * register's does, and the register is where a mark is corrected.
 *
 * Reminding the team is not built here. The team is the department, and its
 * leaders already send it messages from My departments (07 step 7.8).
 */
@Injectable()
export class TrainingService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly team: TeamService,
  ) {}

  async list() {
    const tz = await this.timezone(this.db.client);
    const trainings = await this.db.client.outreachTraining.findMany({
      orderBy: { heldAt: 'desc' },
      take: 100,
      include: { attendance: { select: { mark: true } } },
    });
    return trainings.map((t) => ({
      ...this.view(t, tz),
      attended: t.attendance.filter((a) => a.mark === 'ATTENDED').length,
      marked: t.attendance.length,
    }));
  }

  /**
   * One training, and its register: the team now, plus anyone marked who has
   * since left it, since last month's register still says who came.
   */
  async get(id: string) {
    const tz = await this.timezone(this.db.client);
    const training = await this.db.client.outreachTraining.findUnique({
      where: { id },
      include: {
        attendance: { include: { person: { select: { id: true, fullName: true } } } },
      },
    });
    if (!training) throw notFound('No such training.');
    const team = await this.team.team();
    const marks = new Map(training.attendance.map((a) => [a.personId, a.mark]));
    const register = [
      ...team.people.map((p) => ({ personId: p.personId, name: p.name, onTeam: true })),
      ...training.attendance
        .filter((a) => !team.people.some((p) => p.personId === a.personId))
        .map((a) => ({ personId: a.personId, name: a.person.fullName, onTeam: false })),
    ].map((p) => ({ ...p, mark: marks.get(p.personId) ?? null }));
    return { ...this.view(training, tz), register, departmentId: team.department.id };
  }

  /** Each of the team, and their marks over the last twelve trainings: who has stopped coming. */
  async history() {
    const tz = await this.timezone(this.db.client);
    const [team, trainings] = await Promise.all([
      this.team.team(),
      this.db.client.outreachTraining.findMany({
        where: { heldAt: { lte: new Date() } },
        orderBy: { heldAt: 'desc' },
        take: HISTORY,
        include: { attendance: { select: { personId: true, mark: true } } },
      }),
    ]);
    const oldestFirst = [...trainings].reverse();
    return {
      trainings: oldestFirst.map((t) => ({
        id: t.id,
        topic: t.topic,
        date: this.view(t, tz).date,
      })),
      people: team.people.map((p) => ({
        personId: p.personId,
        name: p.name,
        marks: oldestFirst.map(
          (t) => t.attendance.find((a) => a.personId === p.personId)?.mark ?? null,
        ),
      })),
    };
  }

  async create(input: TrainingInput) {
    return this.db.tx(async (tx) => {
      await this.team.department(tx);
      const training = await tx.outreachTraining.create({
        data: {
          ...(await this.fields(tx, input)),
          createdById: this.auth.userId!,
        },
      });
      await this.audit.recordIn(tx, {
        action: 'outreach.training.planned',
        entityType: 'outreach_training',
        entityId: training.id,
        summary: `Planned the training "${input.topic}" for ${input.date} at ${input.time}`,
      });
      return { id: training.id };
    });
  }

  async update(id: string, input: TrainingInput) {
    await this.db.tx(async (tx) => {
      const before = await tx.outreachTraining.findUnique({ where: { id } });
      if (!before) throw notFound('No such training.');
      await tx.outreachTraining.update({ where: { id }, data: await this.fields(tx, input) });
      await this.audit.recordIn(tx, {
        action: 'outreach.training.updated',
        entityType: 'outreach_training',
        entityId: id,
        summary: `Changed the training "${input.topic}"`,
        before: { topic: before.topic, heldAt: before.heldAt.toISOString() },
        after: { topic: input.topic, date: input.date, time: input.time },
      });
    });
  }

  /**
   * Marks for any of the register: present, absent, or cleared. Only the team,
   * or someone already on this register, can be marked.
   */
  async mark(id: string, marks: Mark[]) {
    await this.db.tx(async (tx) => {
      const training = await tx.outreachTraining.findUnique({
        where: { id },
        include: { attendance: { select: { personId: true } } },
      });
      if (!training) throw notFound('No such training.');
      if (training.heldAt.getTime() > Date.now() + 12 * 3_600_000) {
        throw new AppError(
          409,
          ErrorCode.CONFLICT,
          'That training has not happened yet. Mark who came on the day.',
        );
      }
      const department = await this.team.department(tx);
      const allowed = await this.team.teamIds(tx, department.id);
      for (const a of training.attendance) allowed.add(a.personId);
      if (marks.some((m) => !allowed.has(m.personId))) {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_FAILED,
          'Only the Outreach team can be marked at its training.',
          { marks: ['Not on the team'] },
        );
      }

      let present = 0;
      for (const { personId, mark } of marks) {
        const key = { trainingId_personId: { trainingId: id, personId } };
        if (mark === null) {
          await tx.outreachTrainingAttendance.deleteMany({ where: { trainingId: id, personId } });
          continue;
        }
        await tx.outreachTrainingAttendance.upsert({
          where: key,
          update: { mark, markedById: this.auth.userId!, markedAt: new Date() },
          create: { trainingId: id, personId, mark, markedById: this.auth.userId! },
        });
        if (mark === 'ATTENDED' && (await this.onTimeline(tx, training, personId))) present++;
      }
      await this.audit.recordIn(tx, {
        action: 'outreach.training.marked',
        entityType: 'outreach_training',
        entityId: id,
        summary: `Marked ${marks.length} at the training "${training.topic}"`,
      });
      if (present) this.usage.inc('outreach.training.attendance', present);
    });
  }

  /** That they came, on their timeline, once per training. True when it was written now. */
  private async onTimeline(
    tx: Tx,
    training: { id: string; topic: string; heldAt: Date },
    personId: string,
  ) {
    const written = await tx.personInteraction.findFirst({
      where: { personId, kind: 'TRAINING', meta: { path: ['trainingId'], equals: training.id } },
      select: { id: true },
    });
    if (written) return false;
    await recordInteraction(tx, {
      personId,
      kind: 'TRAINING',
      moduleKey: 'outreach',
      byId: this.auth.userId,
      summary: `Outreach training: ${training.topic}`,
      at: training.heldAt,
      meta: { trainingId: training.id },
    });
    return true;
  }

  private async fields(tx: Tx, input: TrainingInput) {
    const [y, m, d] = input.date.split('-').map(Number) as [number, number, number];
    const [hh, mm] = input.time.split(':').map(Number) as [number, number];
    return {
      topic: input.topic,
      trainer: input.trainer ?? '',
      heldAt: atWall(y, m, d, hh, mm, await this.timezone(tx)),
      venue: input.venue ?? '',
      notes: input.notes ?? '',
    };
  }

  private view(
    t: { id: string; topic: string; trainer: string; heldAt: Date; venue: string; notes: string },
    timezone: string,
  ) {
    const w = wallClock(t.heldAt, timezone);
    const two = (n: number) => String(n).padStart(2, '0');
    return {
      id: t.id,
      topic: t.topic,
      trainer: t.trainer,
      heldAt: t.heldAt.toISOString(),
      /** Church time, as it was typed. */
      date: `${w.y}-${two(w.m)}-${two(w.d)}`,
      time: `${two(w.hh)}:${two(w.mm)}`,
      venue: t.venue,
      notes: t.notes,
    };
  }

  private async timezone(tx: Pick<Tx, 'church'>) {
    const church = await tx.church.findUnique({ where: { id: 1 }, select: { timezone: true } });
    return church?.timezone ?? 'Africa/Dar_es_Salaam';
  }
}

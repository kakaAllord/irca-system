import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { Db, type Tx } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { afterQuiet, nextRun, type Rhythm } from '../../core/comms/next-run.js';
import { AudiencesService } from './audiences.service.js';
import { SendingService } from './sending.service.js';
import { commsSettings } from './settings.js';

export type ScheduleInput = {
  departmentId: string | null;
  name: string;
  audience: { key: string; params: Record<string, unknown> };
  templateIds: string[];
  fields: Record<string, string>;
  daysOfWeek: number[];
  /** Empty: every week. [1]: the first of those days in each month. */
  weeksOfMonth?: number[];
  timeOfDay: string;
  jitterMinutes: number;
  startsOn: string;
  endsOn: string | null;
};

const refuse = (message: string) => new AppError(403, ErrorCode.FORBIDDEN, message);

/**
 * Beats: the same message on a rhythm, from one of several approved
 * templates each time so it does not sound like an alarm (07 step 7.11).
 *
 * A beat sends through exactly the code a person pressing Send uses, as the
 * person who set it up, as they are at that moment: their leadership, the
 * department's grants, the daily limit and every opt-out are checked again
 * each time. A beat set up in March is never a way around a rule made in
 * June, and one whose leader has stepped down stops, and says why.
 */
@Injectable()
export class SchedulesService {
  private readonly logger = new Logger('Beats');

  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly audiences: AudiencesService,
    private readonly sending: SendingService,
  ) {}

  async list(departmentId: string | null | undefined) {
    const where: Prisma.CommsScheduleWhereInput = { archivedAt: null };
    if (this.auth.has('comms.schedules.read')) {
      if (departmentId !== undefined) where.departmentId = departmentId;
    } else {
      if (!departmentId) throw refuse('Choose one of the departments you lead.');
      await this.audiences.requireLeads(departmentId, 'read');
      where.departmentId = departmentId;
    }
    const rows = await this.db.client.commsSchedule.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, createdAt: true, status: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { nextRunAt: 'asc' }],
    });
    const templates = await this.db.client.commsTemplate.findMany({
      where: { id: { in: rows.flatMap((r) => r.templateIds) } },
      select: { id: true, name: true, status: true, familyId: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      department: r.department,
      audienceName: r.audienceName,
      audience: { key: r.audienceKey, params: r.audienceParams },
      templates: r.templateIds.map((id) => templates.find((t) => t.id === id)).filter(Boolean),
      templateIds: r.templateIds,
      fields: r.fields,
      daysOfWeek: r.daysOfWeek,
      weeksOfMonth: r.weeksOfMonth,
      timeOfDay: r.timeOfDay,
      jitterMinutes: r.jitterMinutes,
      startsOn: r.startsOn.toISOString().slice(0, 10),
      endsOn: r.endsOn?.toISOString().slice(0, 10) ?? null,
      isActive: r.isActive,
      nextRunAt: r.nextRunAt?.toISOString() ?? null,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      lastError: r.lastError,
      lastMessage: r.messages[0]
        ? {
            id: r.messages[0].id,
            at: r.messages[0].createdAt.toISOString(),
            status: r.messages[0].status,
          }
        : null,
    }));
  }

  async create(input: ScheduleInput) {
    await this.requireMayManage(input.departmentId);
    const row = await this.db.tx(async (tx) => {
      const checked = await this.check(tx, input);
      const made = await tx.commsSchedule.create({
        data: { ...checked, createdById: this.auth.actorUserId! },
      });
      await this.record(
        tx,
        made.id,
        'comms.schedule.created',
        `Set up "${made.name}" to ${made.audienceName}`,
      );
      return made;
    });
    return { id: row.id, nextRunAt: row.nextRunAt?.toISOString() ?? null };
  }

  async update(id: string, input: ScheduleInput) {
    const current = await this.find(id);
    await this.requireMayManage(current.departmentId);
    if (input.departmentId !== current.departmentId) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        'A recurring message stays with its department.',
      );
    }
    await this.db.tx(async (tx) => {
      const checked = await this.check(tx, input);
      await tx.commsSchedule.update({ where: { id }, data: { ...checked, lastError: null } });
      await this.record(tx, id, 'comms.schedule.changed', `Changed "${checked.name}"`);
    });
  }

  /** Pausing is one field, and it is written down (07 step 7.11). */
  async setActive(id: string, active: boolean) {
    const current = await this.find(id);
    await this.requireMayManage(current.departmentId);
    await this.db.tx(async (tx) => {
      const { quietHours } = await commsSettings(tx);
      const tz = (await tx.church.findFirst())?.timezone ?? 'Africa/Dar_es_Salaam';
      await tx.commsSchedule.update({
        where: { id },
        data: {
          isActive: active,
          nextRunAt: active
            ? nextRun(rhythmOf(current), new Date(), tz, quietHours)
            : current.nextRunAt,
          lastError: null,
        },
      });
      await this.record(
        tx,
        id,
        active ? 'comms.schedule.resumed' : 'comms.schedule.paused',
        `${active ? 'Resumed' : 'Paused'} "${current.name}"`,
      );
    });
  }

  /** Stopped for good and put away. The messages it sent stay: they are what the church said. */
  async archive(id: string) {
    const current = await this.find(id);
    await this.requireMayManage(current.departmentId);
    await this.db.tx(async (tx) => {
      await tx.commsSchedule.update({
        where: { id },
        data: { isActive: false, archivedAt: new Date() },
      });
      await this.record(tx, id, 'comms.schedule.archived', `Stopped "${current.name}" for good`);
    });
  }

  /**
   * Sends every beat that is due, each through the ordinary send, as the
   * person who set it up. Run every minute by CommsJobs.
   */
  async runDue(now = new Date()): Promise<{ sent: number; refused: number; waited: number }> {
    const due = await this.db.client.commsSchedule.findMany({
      where: { isActive: true, archivedAt: null, nextRunAt: { lte: now } },
      take: 20,
    });
    const settings = await commsSettings(this.db.client);
    const tz = (await this.db.client.church.findFirst())?.timezone ?? 'Africa/Dar_es_Salaam';
    let sent = 0;
    let refused = 0;
    let waited = 0;
    for (const beat of due) {
      // A run that comes late into quiet hours (the server was down) waits for morning.
      const morning = afterQuiet(now, tz, settings.quietHours);
      if (morning.getTime() !== now.getTime()) {
        await this.db.client.commsSchedule.update({
          where: { id: beat.id },
          data: { nextRunAt: morning },
        });
        this.logger.log({
          msg: 'beat waits until quiet hours end',
          beat: beat.id,
          until: morning.toISOString(),
        });
        waited++;
        continue;
      }
      let error: string | null = null;
      let messageId: string | null = null;
      try {
        const templateId = await this.pickTemplate(beat.templateIds);
        if (!templateId)
          throw new AppError(
            409,
            ErrorCode.CONFLICT,
            'None of its templates is approved any more.',
          );
        const sender = await this.audiences.senderFor(beat.createdById);
        const result = await this.sending.send(
          {
            departmentId: beat.departmentId,
            audience: {
              key: beat.audienceKey,
              params: beat.audienceParams as Record<string, unknown>,
            },
            templateId,
            fields: beat.fields as Record<string, string>,
            scheduleId: beat.id,
          },
          sender,
        );
        messageId = result.id;
        sent++;
      } catch (err) {
        error = err instanceof AppError ? err.message : (err as Error).message;
        refused++;
        this.logger.warn({ msg: 'beat did not send', beat: beat.id, error });
      }
      await this.db.client.commsSchedule.update({
        where: { id: beat.id },
        data: {
          lastRunAt: now,
          lastError: error?.slice(0, 500) ?? null,
          nextRunAt: nextRun(rhythmOf(beat), now, tz, settings.quietHours),
        },
      });
      if (messageId) this.logger.log({ msg: 'beat sent', beat: beat.id, message: messageId });
    }
    return { sent, refused, waited };
  }

  /**
   * One of its templates, at random. A template that has since been changed
   * and approved again is followed to its current version, so a beat keeps
   * up with its words.
   */
  private async pickTemplate(ids: string[]): Promise<string | null> {
    const named = await this.db.client.commsTemplate.findMany({
      where: { id: { in: ids } },
      select: { familyId: true },
    });
    const current = await this.db.client.commsTemplate.findMany({
      where: { familyId: { in: named.map((t) => t.familyId) }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!current.length) return null;
    return current[Math.floor(Math.random() * current.length)]!.id;
  }

  /** The audience and the words must be ones this person could send now. */
  private async check(tx: Tx, input: ScheduleInput) {
    const { provider, params } = await this.audiences.authorize(
      tx,
      input.departmentId,
      input.audience.key,
      input.audience.params,
    );
    const audienceName = await provider.describe(tx, params);
    const ids = [...new Set(input.templateIds)];
    const templates = await tx.commsTemplate.findMany({ where: { id: { in: ids } } });
    if (templates.length !== ids.length || templates.some((t) => t.status !== 'ACTIVE')) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'Every template must be approved.', {
        templateIds: ['Choose approved templates'],
      });
    }
    if (templates.some((t) => t.departmentId !== null && t.departmentId !== input.departmentId)) {
      throw refuse('One of those templates belongs to another department.');
    }
    const { quietHours } = await commsSettings(tx);
    const tz = (await tx.church.findFirst())?.timezone ?? 'Africa/Dar_es_Salaam';
    const rhythm: Rhythm = {
      daysOfWeek: [...new Set(input.daysOfWeek)].sort(),
      weeksOfMonth: [...new Set(input.weeksOfMonth ?? [])].sort((a, b) => a - b),
      timeOfDay: input.timeOfDay,
      jitterMinutes: input.jitterMinutes,
      startsOn: new Date(`${input.startsOn}T00:00:00Z`),
      endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null,
    };
    if (rhythm.endsOn && rhythm.endsOn < rhythm.startsOn) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'It ends before it starts.', {
        endsOn: ['After the start'],
      });
    }
    return {
      departmentId: input.departmentId,
      name: input.name,
      audienceKey: input.audience.key,
      audienceParams: params as object,
      audienceName: audienceName.slice(0, 200),
      templateIds: ids,
      fields: input.fields,
      ...rhythm,
      nextRunAt: nextRun(rhythm, new Date(), tz, quietHours),
    };
  }

  private async requireMayManage(departmentId: string | null) {
    if (this.auth.has('comms.schedules.manage')) return;
    if (departmentId === null)
      throw refuse('Only Communications sets up its own recurring messages.');
    await this.audiences.requireLeads(departmentId, 'send');
  }

  private async find(id: string) {
    const row = await this.db.client.commsSchedule.findFirst({ where: { id, archivedAt: null } });
    if (!row) throw notFound('No such recurring message.');
    return row;
  }

  private record(tx: Tx, id: string, action: string, summary: string) {
    return this.audit.recordIn(tx, { action, entityType: 'comms_schedule', entityId: id, summary });
  }
}

function rhythmOf(row: {
  daysOfWeek: number[];
  weeksOfMonth: number[];
  timeOfDay: string;
  jitterMinutes: number;
  startsOn: Date;
  endsOn: Date | null;
}): Rhythm {
  return {
    daysOfWeek: row.daysOfWeek,
    weeksOfMonth: row.weeksOfMonth,
    timeOfDay: row.timeOfDay,
    jitterMinutes: row.jitterMinutes,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
  };
}

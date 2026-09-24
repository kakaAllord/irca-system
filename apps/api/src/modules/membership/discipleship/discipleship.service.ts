import { Injectable } from '@nestjs/common';
import { ErrorCode, initialsOf } from '@irca/shared';
import type { AttendanceMark, PersonStage } from '../../../generated/prisma/client.js';
import { Db, type Tx } from '../../../core/database/db.service.js';
import { RequestAuth } from '../../../core/context/request-auth.js';
import { AppError } from '../../../core/http/app-error.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { UsageService } from '../../../core/usage/usage.service.js';
import { moveStage } from '../journey.js';
import { setting } from '../settings.js';

/** The five columns of the board, in the order of the journey. */
const BOARD: PersonStage[] = [
  'NEW_CONVERT',
  'FOUNDATION_CLASS',
  'AWAITING_BAPTISM',
  'MEMBERSHIP_REVIEW',
  'CONFIRMED_MEMBER',
];
const CARDS = 20;

/**
 * The foundation class, and the road from deciding to follow Christ to
 * becoming a member.
 *
 * Nobody is ever moved backwards automatically. Two missed sessions in a row
 * is shown as a warning, because the church's own note says it "would drop
 * him back" — but it is a person who decides that, after a visit or a call.
 */
@Injectable()
export class DiscipleshipService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
  ) {}

  groups() {
    return this.db.client.foundationGroup.findMany({
      where: {},
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async createGroup(name: string) {
    const group = await this.db.tx(async (tx) => {
      const created = await tx.foundationGroup
        .create({ data: { name: name.trim() } })
        .catch((err: unknown) => {
          if ((err as { code?: string }).code === 'P2002') {
            throw new AppError(409, ErrorCode.ALREADY_EXISTS, `There is already a "${name}".`);
          }
          throw err;
        });
      await this.audit.recordIn(tx, {
        action: 'membership.group.created',
        entityType: 'foundation_group',
        entityId: created.id,
        summary: `Started the foundation class group "${created.name}"`,
      });
      return created;
    });
    return { id: group.id };
  }

  async updateGroup(id: string, input: { name?: string; isActive?: boolean }): Promise<void> {
    await this.db.tx(async (tx) => {
      const group = await tx.foundationGroup.findFirst({ where: { id } });
      if (!group) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such group.');
      await tx.foundationGroup.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name.trim() } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit.recordIn(tx, {
        action: 'membership.group.updated',
        entityType: 'foundation_group',
        entityId: id,
        summary: `Changed the foundation class group "${group.name}"`,
      });
    });
  }

  /** Signing someone up puts them in the class: that is the next stage. */
  async enroll(personId: string, groupId: string) {
    const enrollment = await this.db.tx(async (tx) => {
      const [person, group] = await Promise.all([
        tx.person.findFirst({ where: { id: personId } }),
        tx.foundationGroup.findFirst({ where: { id: groupId, isActive: true } }),
      ]);
      if (!person) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person.');
      if (!group) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such group, or it has closed.');

      const created = await tx.foundationEnrollment
        .create({ data: { personId, groupId } })
        .catch((err: unknown) => {
          // foundation_enrollments_open_idx: one open sign-up per person.
          if ((err as { code?: string }).code === 'P2002') {
            throw new AppError(409, ErrorCode.ALREADY_ENROLLED, 'They are already in a class.');
          }
          throw err;
        });
      if (person.stage === 'VISITOR' || person.stage === 'NEW_CONVERT') {
        await moveStage(tx, person, 'FOUNDATION_CLASS', this.auth.userId, `Joined ${group.name}`);
      }
      await this.audit.recordIn(tx, {
        action: 'membership.class.enrolled',
        entityType: 'person',
        entityId: personId,
        summary: `Signed ${person.fullName || 'someone'} up for ${group.name}`,
      });
      return created;
    });
    return { id: enrollment.id };
  }

  async drop(enrollmentId: string): Promise<void> {
    await this.db.tx(async (tx) => {
      const enrollment = await tx.foundationEnrollment.findFirst({
        where: { id: enrollmentId, completedAt: null, droppedAt: null },
        include: { person: true },
      });
      if (!enrollment) throw new AppError(404, ErrorCode.NOT_FOUND, 'No open sign-up like that.');
      await tx.foundationEnrollment.update({
        where: { id: enrollmentId },
        data: { droppedAt: new Date() },
      });
      await this.audit.recordIn(tx, {
        action: 'membership.class.dropped',
        entityType: 'person',
        entityId: enrollment.personId,
        summary: `Took ${enrollment.person.fullName || 'someone'} off the foundation class`,
      });
    });
  }

  /**
   * One tick in the register. Clearing a mark is allowed: a wrong tap on a
   * Thursday evening should not be permanent.
   */
  async mark(enrollmentId: string, sessionNo: number, mark: AttendanceMark | null): Promise<void> {
    await this.db.tx(async (tx) => {
      const enrollment = await this.openEnrollment(tx, enrollmentId);
      const sessions = await setting(tx, 'membership.foundationSessions');
      if (sessionNo < 1 || sessionNo > sessions) {
        throw new AppError(400, ErrorCode.VALIDATION_FAILED, `The class has ${sessions} sessions.`);
      }
      await this.write(tx, enrollmentId, sessionNo, mark);
      await this.finishIfDone(tx, enrollment.id, sessions);
    });
    this.usage.inc('membership.attendance.marked');
  }

  /** "Mark today's session": everyone ticked attended, everyone else missed. */
  async markAll(groupId: string, sessionNo: number, attended: string[]): Promise<void> {
    await this.db.tx(async (tx) => {
      const sessions = await setting(tx, 'membership.foundationSessions');
      const enrollments = await tx.foundationEnrollment.findMany({
        where: { groupId, completedAt: null, droppedAt: null },
      });
      for (const enrollment of enrollments) {
        await this.write(
          tx,
          enrollment.id,
          sessionNo,
          attended.includes(enrollment.id) ? 'ATTENDED' : 'MISSED',
        );
        await this.finishIfDone(tx, enrollment.id, sessions);
      }
      await this.audit.recordIn(tx, {
        action: 'membership.class.session_marked',
        entityType: 'foundation_group',
        entityId: groupId,
        summary: `Marked session ${sessionNo}: ${attended.length} of ${enrollments.length} came`,
      });
    });
    this.usage.inc('membership.attendance.marked');
  }

  /** The class register: every open sign-up in a group, and each session's mark. */
  async register(groupId: string) {
    const sessions = await this.db.tx((tx) =>
      setting(tx, 'membership.foundationSessions'),
    );
    const rows = await this.db.client.foundationEnrollment.findMany({
      where: { groupId, droppedAt: null },
      include: { person: true, attendance: true },
      orderBy: { enrolledAt: 'asc' },
    });
    return {
      sessions,
      rows: rows.map((e) => {
        const marks = Array.from(
          { length: sessions },
          (_, i) => e.attendance.find((a) => a.sessionNo === i + 1)?.mark ?? null,
        );
        return {
          enrollmentId: e.id,
          personId: e.personId,
          fullName: e.person.fullName || 'Unknown',
          initials: e.person.fullName ? initialsOf(e.person.fullName) : '?',
          completed: !!e.completedAt,
          marks,
          attended: marks.filter((m) => m === 'ATTENDED').length,
          atRisk: twoMissedInARow(marks),
        };
      }),
    };
  }

  /** The five columns, each with its count and the first cards. */
  async board(groupId?: string) {
    const sessions = await this.db.tx((tx) =>
      setting(tx, 'membership.foundationSessions'),
    );

    const columns = await Promise.all(
      BOARD.map(async (stage) => {
        const where = {
          stage,
          ...(groupId ? { enrollments: { some: { groupId } } } : {}),
        };
        const [count, people] = await Promise.all([
          this.db.client.person.count({ where }),
          this.db.client.person.findMany({
            where,
            include: {
              registration: { select: { bapt: true } },
              enrollments: {
                orderBy: { enrolledAt: 'desc' },
                take: 1,
                include: { group: true, attendance: true },
              },
            },
            orderBy: stage === 'CONFIRMED_MEMBER' ? { confirmedAt: 'desc' } : { updatedAt: 'desc' },
            take: CARDS,
          }),
        ]);
        return {
          stage,
          count,
          cards: people.map((p) => {
            const enrollment = p.enrollments[0];
            const marks = enrollment
              ? Array.from(
                  { length: sessions },
                  (_, i) => enrollment.attendance.find((a) => a.sessionNo === i + 1)?.mark ?? null,
                )
              : [];
            const attended = marks.filter((m) => m === 'ATTENDED').length;
            const baptised = p.baptised ?? p.registration?.bapt ?? false;
            return {
              personId: p.id,
              fullName: p.fullName || 'Unknown',
              initials: p.fullName ? initialsOf(p.fullName) : '?',
              group: enrollment && !enrollment.droppedAt ? enrollment.group.name : null,
              enrollmentId:
                enrollment && !enrollment.droppedAt && !enrollment.completedAt
                  ? enrollment.id
                  : null,
              progress: enrollment ? { attended, of: sessions } : null,
              atRisk: twoMissedInARow(marks),
              baptised,
              memberNumber: p.memberNumber,
              readyToApply: !!enrollment?.completedAt && baptised && stage === 'AWAITING_BAPTISM',
            };
          }),
        };
      }),
    );
    return { sessions, columns };
  }

  private async openEnrollment(tx: Tx, id: string) {
    const enrollment = await tx.foundationEnrollment.findFirst({
      where: { id, droppedAt: null },
    });
    if (!enrollment) throw new AppError(404, ErrorCode.NOT_FOUND, 'No open sign-up like that.');
    return enrollment;
  }

  private async write(
    tx: Tx,
    enrollmentId: string,
    sessionNo: number,
    mark: AttendanceMark | null,
  ): Promise<void> {
    if (mark === null) {
      await tx.foundationAttendance.deleteMany({ where: { enrollmentId, sessionNo } });
      return;
    }
    await tx.foundationAttendance.upsert({
      where: { enrollmentId_sessionNo: { enrollmentId, sessionNo } },
      update: { mark, markedById: this.auth.userId!, markedAt: new Date() },
      create: { enrollmentId, sessionNo, mark, markedById: this.auth.userId! },
    });
  }

  /**
   * Every session attended finishes the class. Someone not yet baptised moves
   * on to awaiting baptism; someone already baptised is ready to apply.
   */
  private async finishIfDone(
    tx: Tx,
    enrollmentId: string,
    sessions: number,
  ) {
    const enrollment = await tx.foundationEnrollment.findFirst({
      where: { id: enrollmentId },
      include: { attendance: true, person: { include: { registration: true } } },
    });
    if (!enrollment || enrollment.completedAt) return;
    const attended = enrollment.attendance.filter((a) => a.mark === 'ATTENDED').length;
    if (attended < sessions) return;

    await tx.foundationEnrollment.update({
      where: { id: enrollmentId },
      data: { completedAt: new Date() },
    });
    const person = enrollment.person;
    const baptised = person.baptised ?? person.registration?.bapt ?? false;
    if (person.stage === 'FOUNDATION_CLASS') {
      await moveStage(
        tx,
        person,
        'AWAITING_BAPTISM',
        null,
        baptised
          ? 'Finished the foundation class, already baptised'
          : 'Finished the foundation class',
      );
    }
  }
}

/** Two MISSED next to each other, ignoring sessions not yet held. */
function twoMissedInARow(marks: (AttendanceMark | null)[]): boolean {
  return marks.some((m, i) => m === 'MISSED' && marks[i + 1] === 'MISSED');
}

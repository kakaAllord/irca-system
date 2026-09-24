import { Injectable } from '@nestjs/common';
import { ErrorCode, initialsOf } from '@irca/shared';
import type {
  ApplicationStatus,
  MembershipApplication,
  Person,
} from '../../../generated/prisma/client.js';
import { Db, type Tx } from '../../../core/database/db.service.js';
import { RequestAuth } from '../../../core/context/request-auth.js';
import { AppError } from '../../../core/http/app-error.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { UsageService } from '../../../core/usage/usage.service.js';
import { SequenceService } from '../../../core/sequences/sequence.service.js';
import { moveStage, previousStage } from '../journey.js';
import { setting } from '../settings.js';

const OPEN: ApplicationStatus[] = ['UNDER_REVIEW', 'APPROVED'];
const DAY = 86_400_000;

/**
 * Asking to become a member, and the pastors' answer.
 *
 * The steps are the church's own: submitted, under review, approved by a
 * pastor, and — once the probation month has passed — confirmed, which is
 * when someone gets their member number. The number comes from the same
 * gapless counter as finance entries, so it is never skipped or reused.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly sequences: SequenceService,
  ) {}

  async list(status?: ApplicationStatus) {
    const probationDays = await this.db.tx((tx) =>
      setting(tx, 'membership.probationDays'),
    );
    const [rows, grouped] = await Promise.all([
      this.db.client.membershipApplication.findMany({
        where: { ...(status ? { status } : { status: 'UNDER_REVIEW' }) },
        orderBy: { submittedAt: 'desc' },
        take: 100,
        include: {
          person: {
            include: {
              registration: { select: { bapt: true, createdAt: true } },
              enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1 },
            },
          },
        },
      }),
      this.db.client.membershipApplication.groupBy({
        by: ['status'],
        where: {},
        _count: { _all: true },
      }),
    ]);

    return {
      counts: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
      probationDays,
      rows: rows.map((a) => {
        const availableOn =
          a.status === 'APPROVED' && a.decidedAt
            ? new Date(a.decidedAt.getTime() + probationDays * DAY).toISOString().slice(0, 10)
            : null;
        const enrollment = a.person.enrollments[0];
        return {
          id: a.id,
          status: a.status,
          source: a.source,
          submittedAt: a.submittedAt.toISOString(),
          decidedAt: a.decidedAt?.toISOString() ?? null,
          rejectReason: a.rejectReason,
          availableOn,
          canConfirm: !!availableOn && availableOn <= today(),
          person: {
            id: a.person.id,
            fullName: a.person.fullName || 'Unknown',
            initials: a.person.fullName ? initialsOf(a.person.fullName) : '?',
            stage: a.person.stage,
            memberNumber: a.person.memberNumber,
            attendsSince:
              a.person.registration?.createdAt.toISOString() ?? a.person.createdAt.toISOString(),
            baptised: a.person.baptised ?? a.person.registration?.bapt ?? false,
            foundationClass: enrollment
              ? enrollment.completedAt
                ? 'finished'
                : enrollment.droppedAt
                  ? 'dropped'
                  : 'attending'
              : 'not started',
          },
        };
      }),
    };
  }

  /** The office enters an application for someone. */
  async submit(personId: string, note?: string) {
    const application = await this.db.tx(async (tx) => {
      const person = await tx.person.findFirst({ where: { id: personId } });
      if (!person) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person.');
      const open = await tx.membershipApplication.findFirst({
        where: { personId, status: { in: OPEN } },
      });
      if (open) {
        throw new AppError(
          409,
          ErrorCode.ALREADY_APPLIED,
          'They already have an application open.',
        );
      }
      const created = await tx.membershipApplication.create({
        data: {
          personId,
          source: 'OFFICE',
          submittedById: this.auth.userId,
          reviewNote: note || null,
        },
      });
      await moveStage(tx, person, 'MEMBERSHIP_REVIEW', this.auth.userId, 'Applied for membership');
      await this.audit.recordIn(tx, {
        action: 'membership.application.submitted',
        entityType: 'membership_application',
        entityId: created.id,
        summary: `Entered a membership application for ${person.fullName}`,
      });
      return created;
    });
    this.usage.inc('membership.applications.submitted');
    return { id: application.id };
  }

  async approve(id: string, note?: string): Promise<void> {
    await this.decide(id, ['UNDER_REVIEW'], 'approved', async (tx, app, person) => {
      await tx.membershipApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          decidedById: this.auth.userId,
          decidedAt: new Date(),
          reviewNote: note ?? app.reviewNote,
        },
      });
      // An application from the form arrives before anyone has reviewed the
      // person; approving it puts them where the office's ones already are.
      await moveStage(tx, person, 'MEMBERSHIP_REVIEW', this.auth.userId, 'Application approved');
      return `Approved ${person.fullName}'s membership application`;
    });
  }

  async reject(id: string, reason: string): Promise<void> {
    await this.decide(id, ['UNDER_REVIEW'], 'rejected', async (tx, _app, person) => {
      await tx.membershipApplication.update({
        where: { id },
        data: {
          status: 'REJECTED',
          decidedById: this.auth.userId,
          decidedAt: new Date(),
          rejectReason: reason,
        },
      });
      // Back to wherever they were before they applied, as the journey says.
      if (person.stage === 'MEMBERSHIP_REVIEW') {
        const back = (await previousStage(tx, person.id)) ?? 'VISITOR';
        await moveStage(tx, person, back, this.auth.userId, `Application not approved: ${reason}`);
      }
      return `Did not approve ${person.fullName}'s membership application`;
    });
  }

  /**
   * After the probation month: a member, with a number. Too early is refused
   * with the day it becomes possible, so the button can say it.
   */
  async confirm(id: string): Promise<{ memberNumber: number }> {
    let memberNumber = 0;
    await this.decide(id, ['APPROVED'], 'confirmed', async (tx, app, person) => {
      const days = await setting(tx, 'membership.probationDays');
      const availableOn = new Date(app.decidedAt!.getTime() + days * DAY)
        .toISOString()
        .slice(0, 10);
      if (availableOn > today()) {
        throw new AppError(
          422,
          ErrorCode.PROBATION_NOT_OVER,
          `They can be confirmed from ${availableOn}.`,
          { availableOn },
        );
      }
      memberNumber = await this.sequences.next(tx, 'membership:member_number');
      await tx.membershipApplication.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedById: this.auth.userId, confirmedAt: new Date() },
      });
      await tx.person.update({
        where: { id: person.id },
        data: { memberNumber, confirmedAt: new Date() },
      });
      await moveStage(tx, person, 'CONFIRMED_MEMBER', this.auth.userId, 'Confirmed as a member');
      return `Confirmed ${person.fullName} as member ${memberNumber}`;
    });
    this.usage.inc('membership.members.confirmed');
    return { memberNumber };
  }

  async withdraw(id: string): Promise<void> {
    await this.decide(id, OPEN, 'withdrawn', async (tx, _app, person) => {
      await tx.membershipApplication.update({ where: { id }, data: { status: 'WITHDRAWN' } });
      if (person.stage === 'MEMBERSHIP_REVIEW') {
        const back = (await previousStage(tx, person.id)) ?? 'VISITOR';
        await moveStage(tx, person, back, this.auth.userId, 'Application withdrawn');
      }
      return `Withdrew ${person.fullName}'s membership application`;
    });
  }

  /** One decision, in one transaction, from the state it must be in. */
  private async decide(
    id: string,
    from: ApplicationStatus[],
    action: string,
    act: (tx: Tx, app: MembershipApplication, person: Person) => Promise<string>,
  ): Promise<void> {
    await this.db.tx(async (tx) => {
      const app = await tx.membershipApplication.findFirst({ where: { id } });
      if (!app) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such application.');
      if (!from.includes(app.status)) {
        throw new AppError(409, ErrorCode.CONFLICT, 'That application is not at that step.');
      }
      const person = await tx.person.findFirstOrThrow({ where: { id: app.personId } });
      const summary = await act(tx, app, person);
      await this.audit.recordIn(tx, {
        action: `membership.application.${action}`,
        entityType: 'membership_application',
        entityId: id,
        summary,
      });
    });
  }
}

const today = () => new Date().toISOString().slice(0, 10);

import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode, normalizeEmail } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { PrismaDb } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { AuditService, insertAuditEvent } from '../audit/audit.service.js';
import { EmailService } from '../email/email.service.js';
import { UsageService } from '../usage/usage.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { newToken, tokenHash } from '../auth/tokens.js';
import { PermissionResolver } from '../rbac/permission-resolver.service.js';
import type { RequestContext } from '../context/request-context.js';
import type { Tx } from '../database/db.service.js';

const VALID_HOURS = 72;
const MAX_SENDS_PER_DAY = 5;

export type InviteInput = {
  email: string;
  fullName: string;
  roleIds: string[];
  /** The person in People the account belongs to: a department leader (D28). */
  personId?: string;
  /** What the email says they were invited as, when it is not a role: "Chairperson of the Praise team". */
  asWhat?: string;
};

/** Work that must stand or fall with the invitation, run inside its transaction. */
export type AlsoInTransaction = (tx: Tx, userId: string) => Promise<void>;

/**
 * Invitations, which are how anyone gets access.
 *
 * The person, their place in the church and their roles are created when the
 * invitation is sent, so an administrator can change the roles before it is
 * accepted and the People page can show who is still waiting. None of it does
 * anything until they accept: roles only count for an active membership.
 *
 * This is core work, not a feature: accounts are shared across churches, and
 * feature code is not allowed to write them at all.
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly db: PrismaDb,
    private readonly config: AppConfig,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly usage: UsageService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionResolver,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async invite(input: InviteInput, also?: AlsoInTransaction): Promise<{ userId: string }> {
    const email = normalizeEmail(input.email);
    const roles = await this.assignableRoles(input.roleIds);

    const church = await this.db.church.findFirstOrThrow();
    const inviter = await this.db.user.findUniqueOrThrow({ where: { id: this.auth.actorUserId! } });
    const existing = await this.db.user.findUnique({ where: { email } });

    if (existing?.status === 'ACTIVE') {
      throw new AppError(
        409,
        ErrorCode.ALREADY_MEMBER,
        `${input.fullName} already has access. Change their roles on their page.`,
      );
    }
    if (existing?.status === 'INVITED') {
      throw new AppError(
        409,
        ErrorCode.ALREADY_INVITED,
        'They have already been invited. Resend it from their page.',
      );
    }
    if (existing?.status === 'DISABLED') {
      throw new AppError(
        409,
        ErrorCode.MEMBER_DISABLED,
        'Their access was disabled. Re-enable it from their page instead.',
      );
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + VALID_HOURS * 3_600_000);

    const userId = await this.db.$transaction(async (tx) => {
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email,
            fullName: input.fullName.trim(),
            status: 'INVITED',
            personId: input.personId ?? null,
          },
        }));
      const asWhat =
        roles.map((r) => r.name).join(' and ') || input.asWhat || 'a member of the office';

      for (const role of roles) {
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id, grantedById: inviter.id },
        });
      }
      await tx.invitation.create({
        data: {
          userId: user.id,
          email,
          tokenHash: tokenHash(token),
          expiresAt,
          createdById: inviter.id,
        },
      });
      await this.email.enqueue(tx, {
        to: email,
        template: 'invitation',
        payload: {
          churchName: church.name,
          inviterName: inviter.fullName,
          personName: input.fullName.trim(),
          roleSummary: asWhat,
          link: `${this.config.get('PORTAL_ORIGIN')}/accept-invite?token=${token}`,
          expiresOn: formatIn(expiresAt, church.timezone),
          needsPassword: !user.passwordHash,
        },
      });
      await insertAuditEvent(tx, {
        source: 'feature',
        actorUserId: inviter.id,
        subjectUserId: inviter.id,
        action: 'admin.user.invited',
        entityType: 'user',
        entityId: user.id,
        summary: `Invited ${email} as ${roles.map((r) => r.name).join(', ') || input.asWhat || 'no role yet'}`,
        after: { email, roles: roles.map((r) => r.name) },
        requestId: null,
      });
      await also?.(tx as unknown as Tx, user.id);
      return user.id;
    });

    this.usage.inc('admin.invitations.sent');
    return { userId };
  }

  /** A new token and a new email; the old link stops working. */
  async resend(userId: string): Promise<void> {
    const { user: invited, invitation } = await this.pending(userId);

    const sentToday = await this.db.invitation.count({
      where: { userId: invited.id, lastSentAt: { gt: new Date(Date.now() - 86_400_000) } },
    });
    if (sentToday >= MAX_SENDS_PER_DAY) {
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        'That invitation has been sent several times today already.',
      );
    }

    const church = await this.db.church.findFirstOrThrow();
    const inviter = await this.db.user.findUniqueOrThrow({ where: { id: this.auth.actorUserId! } });
    const token = newToken();
    const expiresAt = new Date(Date.now() + VALID_HOURS * 3_600_000);

    await this.db.$transaction(async (tx) => {
      if (invitation) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { revokedAt: new Date() },
        });
      }
      await tx.invitation.create({
        data: {
          userId: invited.id,
          email: invited.email,
          tokenHash: tokenHash(token),
          expiresAt,
          createdById: inviter.id,
          sentCount: (invitation?.sentCount ?? 0) + 1,
        },
      });
      await this.email.enqueue(tx, {
        to: invited.email,
        template: 'invitation',
        payload: {
          churchName: church.name,
          inviterName: inviter.fullName,
          personName: invited.fullName,
          roleSummary: 'the roles you were given',
          link: `${this.config.get('PORTAL_ORIGIN')}/accept-invite?token=${token}`,
          expiresOn: formatIn(expiresAt, church.timezone),
          needsPassword: !invited.passwordHash,
        },
      });
    });
    await this.audit.recordNow({
      action: 'admin.invitation.resent',
      entityType: 'user',
      entityId: userId,
      summary: `Sent ${invited.email} their invitation again`,
    });
  }

  /** Cancels it: the link stops working and their place is closed. */
  async revoke(userId: string): Promise<void> {
    const { user: invited, invitation } = await this.pending(userId);

    await this.db.$transaction(async (tx) => {
      if (invitation) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { revokedAt: new Date() },
        });
      }
      await tx.user.update({
        where: { id: invited.id },
        data: { status: 'DISABLED' },
      });
    });
    await this.audit.recordNow({
      action: 'admin.invitation.revoked',
      entityType: 'user',
      entityId: userId,
      summary: `Cancelled the invitation for ${invited.email}`,
    });
  }

  /** What the accept page shows before anyone types anything. */
  async describe(token: string) {
    const invitation = await this.valid(token);
    const invited = await this.db.user.findUniqueOrThrow({
      where: { id: invitation.userId },
      include: { roles: { include: { role: true } } },
    });
    const church = await this.db.church.findFirstOrThrow();
    const inviter = await this.db.user.findUnique({ where: { id: invitation.createdById } });
    // A leader has no role; what they lead is what they were invited as.
    const leads = invited.personId
      ? await this.db.departmentLeader.findMany({
          where: { personId: invited.personId, endedAt: null, department: { archivedAt: null } },
          include: { department: true },
        })
      : [];
    const as = [
      ...invited.roles.map((r) => r.role.name),
      ...leads.map((l) => `${l.title} of ${l.department.name}`),
    ];
    return {
      churchName: church.name,
      email: invited.email,
      fullName: invited.fullName,
      inviterName: inviter?.fullName ?? 'Your church administrator',
      roleSummary: as.join(' and ') || 'a member of the office',
      needsPassword: !invited.passwordHash,
    };
  }

  /** Sets the password if one is needed, opens the door, and signs them in. */
  async accept(
    token: string,
    input: { password?: string; fullName?: string },
    context: { ip: string | null; userAgent: string | null },
  ): Promise<{ sessionToken: string }> {
    const invitation = await this.valid(token);
    const invited = await this.db.user.findUniqueOrThrow({
      where: { id: invitation.userId },
    });

    const needsPassword = !invited.passwordHash;
    if (needsPassword) {
      if (!input.password) {
        throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'Choose a password.', {
          password: ['Choose a password'],
        });
      }
      const problem = this.passwords.check(input.password);
      if (problem) {
        throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That password cannot be used.', {
          password: [PASSWORD_PROBLEM[problem]],
        });
      }
    }

    await this.db.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await tx.user.update({
        where: { id: invited.id },
        data: {
          status: 'ACTIVE',
          ...(input.fullName?.trim() ? { fullName: input.fullName.trim() } : {}),
          ...(needsPassword && input.password
            ? {
                passwordHash: await this.passwords.hash(input.password),
                passwordChangedAt: new Date(),
              }
            : {}),
        },
      });
      await insertAuditEvent(tx, {
        source: 'feature',
        actorUserId: invited.id,
        subjectUserId: invited.id,
        action: 'admin.invitation.accepted',
        entityType: 'user',
        entityId: invited.id,
        summary: `${invited.email} accepted their invitation`,
      });
    });

    this.usage.inc('admin.invitations.accepted');
    const { token: sessionToken, session } = await this.sessions.create({
      userId: invited.id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    // The rest of this request is them, so the answer already describes their
    // portal rather than making the page ask again.
    this.cls.set('sessionId', session.id);
    this.cls.set('userId', invited.id);
    this.cls.set('actorUserId', invited.id);
    this.cls.set('permissions', await this.permissions.forUser(invited.id));
    return { sessionToken };
  }

  /** Roles an administrator may hand out: those of portals that are on. */
  private async assignableRoles(roleIds: string[]) {
    const roles = await this.db.role.findMany({
      where: { id: { in: roleIds }, deletedAt: null },
    });
    if (roles.length !== roleIds.length) {
      throw new AppError(
        422,
        ErrorCode.ROLE_NOT_AVAILABLE,
        'One of those roles does not exist here.',
      );
    }
    const enabled = new Set(
      (await this.db.moduleState.findMany({ where: { enabled: true } })).map((m) => m.moduleKey),
    );
    const off = roles.find((r) => !enabled.has(r.moduleKey));
    if (off) {
      throw new AppError(
        422,
        ErrorCode.ROLE_NOT_AVAILABLE,
        `The ${off.moduleKey} portal is turned off, so ${off.name} cannot be given out.`,
      );
    }
    return roles;
  }

  private async pending(userId: string) {
    const invited = await this.db.user.findUnique({ where: { id: userId } });
    if (!invited) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person here.');
    if (invited.status !== 'INVITED') {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'That person has already accepted, or their access was disabled.',
      );
    }
    const invitation = await this.db.invitation.findFirst({
      where: { userId: invited.id, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { user: invited, invitation };
  }

  private async valid(token: string) {
    const invitation = await this.db.invitation.findUnique({
      where: { tokenHash: tokenHash(token) },
    });
    if (!invitation) {
      throw new AppError(410, ErrorCode.INVITATION_INVALID, 'This invitation link is not valid.', {
        reason: 'unknown',
      });
    }
    if (invitation.acceptedAt) {
      throw new AppError(
        410,
        ErrorCode.INVITATION_INVALID,
        'This invitation has already been used.',
        {
          reason: 'used',
        },
      );
    }
    if (invitation.revokedAt) {
      throw new AppError(410, ErrorCode.INVITATION_INVALID, 'This invitation was cancelled.', {
        reason: 'revoked',
      });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new AppError(
        410,
        ErrorCode.INVITATION_INVALID,
        'This invitation has expired. Ask for a new one.',
        {
          reason: 'expired',
        },
      );
    }
    return invitation;
  }
}

const PASSWORD_PROBLEM = {
  too_short: 'Use at least 10 characters',
  too_long: 'Use at most 128 characters',
  too_common: 'That password appears in lists of breached passwords',
} as const;

/** A date as the church reads it: "Thursday 24 September at 10:40". */
function formatIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

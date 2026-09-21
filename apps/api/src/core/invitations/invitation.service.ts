import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode, normalizeEmail } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { PrismaCore } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../email/email.service.js';
import { UsageService } from '../usage/usage.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { newToken, tokenHash } from '../auth/tokens.js';
import { PermissionResolver } from '../rbac/permission-resolver.service.js';
import type { RequestContext } from '../context/request-context.js';

const VALID_HOURS = 72;
const MAX_SENDS_PER_DAY = 5;

export type InviteInput = { email: string; fullName: string; roleIds: string[] };

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
    private readonly db: PrismaCore,
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

  async invite(input: InviteInput): Promise<{ userId: string }> {
    const churchId = this.auth.requireChurch();
    const email = normalizeEmail(input.email);
    const roles = await this.assignableRoles(churchId, input.roleIds);

    const church = await this.db.church.findUniqueOrThrow({ where: { id: churchId } });
    const inviter = await this.db.user.findUniqueOrThrow({ where: { id: this.auth.actorUserId! } });
    const existing = await this.db.user.findUnique({
      where: { email },
      include: { memberships: { where: { churchId } } },
    });

    const membership = existing?.memberships[0];
    if (membership?.status === 'ACTIVE') {
      throw new AppError(
        409,
        ErrorCode.ALREADY_MEMBER,
        `${input.fullName} already has access. Change their roles on their page.`,
      );
    }
    if (membership?.status === 'INVITED') {
      throw new AppError(
        409,
        ErrorCode.ALREADY_INVITED,
        'They have already been invited. Resend it from their page.',
      );
    }
    if (membership?.status === 'DISABLED') {
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
          data: { email, fullName: input.fullName.trim(), status: 'INVITED' },
        }));

      const created = await tx.churchMembership.create({
        data: { churchId, userId: user.id, status: 'INVITED', invitedById: inviter.id },
      });
      for (const role of roles) {
        await tx.membershipRole.create({
          data: { churchId, membershipId: created.id, roleId: role.id, grantedById: inviter.id },
        });
      }
      await tx.invitation.create({
        data: {
          churchId,
          membershipId: created.id,
          email,
          tokenHash: tokenHash(token),
          expiresAt,
          createdById: inviter.id,
        },
      });
      await this.email.enqueue(tx, {
        churchId,
        to: email,
        template: 'invitation',
        payload: {
          churchName: church.name,
          inviterName: inviter.fullName,
          personName: input.fullName.trim(),
          roleSummary: roles.map((r) => r.name).join(' and ') || 'a member of the office',
          link: `${this.config.get('PORTAL_ORIGIN')}/accept-invite?token=${token}`,
          expiresOn: formatIn(expiresAt, church.timezone),
          needsPassword: !user.passwordHash,
        },
      });
      await tx.auditEvent.create({
        data: {
          churchId,
          source: 'feature',
          actorUserId: inviter.id,
          subjectUserId: inviter.id,
          action: 'admin.user.invited',
          entityType: 'user',
          entityId: user.id,
          summary: `Invited ${email} as ${roles.map((r) => r.name).join(', ') || 'no role yet'}`,
          after: { email, roles: roles.map((r) => r.name) },
          requestId: null,
        },
      });
      return user.id;
    });

    this.usage.inc('admin.invitations.sent');
    return { userId };
  }

  /** A new token and a new email; the old link stops working. */
  async resend(userId: string): Promise<void> {
    const churchId = this.auth.requireChurch();
    const { membership, invitation } = await this.pending(churchId, userId);

    const sentToday = await this.db.invitation.count({
      where: { membershipId: membership.id, lastSentAt: { gt: new Date(Date.now() - 86_400_000) } },
    });
    if (sentToday >= MAX_SENDS_PER_DAY) {
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        'That invitation has been sent several times today already.',
      );
    }

    const church = await this.db.church.findUniqueOrThrow({ where: { id: churchId } });
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
          churchId,
          membershipId: membership.id,
          email: membership.user.email,
          tokenHash: tokenHash(token),
          expiresAt,
          createdById: inviter.id,
          sentCount: (invitation?.sentCount ?? 0) + 1,
        },
      });
      await this.email.enqueue(tx, {
        churchId,
        to: membership.user.email,
        template: 'invitation',
        payload: {
          churchName: church.name,
          inviterName: inviter.fullName,
          personName: membership.user.fullName,
          roleSummary: 'the roles you were given',
          link: `${this.config.get('PORTAL_ORIGIN')}/accept-invite?token=${token}`,
          expiresOn: formatIn(expiresAt, church.timezone),
          needsPassword: !membership.user.passwordHash,
        },
      });
    });
    await this.audit.recordNow({
      action: 'admin.invitation.resent',
      entityType: 'user',
      entityId: userId,
      summary: `Sent ${membership.user.email} their invitation again`,
    });
  }

  /** Cancels it: the link stops working and their place is closed. */
  async revoke(userId: string): Promise<void> {
    const churchId = this.auth.requireChurch();
    const { membership, invitation } = await this.pending(churchId, userId);

    await this.db.$transaction(async (tx) => {
      if (invitation) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { revokedAt: new Date() },
        });
      }
      await tx.churchMembership.update({
        where: { id: membership.id },
        data: { status: 'DISABLED' },
      });
      // Someone who never set a password and belongs nowhere else has no
      // account to keep.
      const others = await tx.churchMembership.count({
        where: { userId, status: { not: 'DISABLED' }, NOT: { id: membership.id } },
      });
      if (!others && !membership.user.passwordHash) {
        await tx.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
      }
    });
    await this.audit.recordNow({
      action: 'admin.invitation.revoked',
      entityType: 'user',
      entityId: userId,
      summary: `Cancelled the invitation for ${membership.user.email}`,
    });
  }

  /** What the accept page shows before anyone types anything. */
  async describe(token: string) {
    const invitation = await this.valid(token);
    const membership = await this.db.churchMembership.findUniqueOrThrow({
      where: { id: invitation.membershipId },
      include: { user: true, church: true, roles: { include: { role: true } } },
    });
    const inviter = await this.db.user.findUnique({ where: { id: invitation.createdById } });
    return {
      churchName: membership.church.name,
      email: membership.user.email,
      fullName: membership.user.fullName,
      inviterName: inviter?.fullName ?? 'Your church administrator',
      roleSummary:
        membership.roles.map((r) => r.role.name).join(' and ') || 'a member of the office',
      needsPassword: !membership.user.passwordHash,
    };
  }

  /** Sets the password if one is needed, opens the door, and signs them in. */
  async accept(
    token: string,
    input: { password?: string; fullName?: string },
    context: { ip: string | null; userAgent: string | null },
  ): Promise<{ sessionToken: string }> {
    const invitation = await this.valid(token);
    const membership = await this.db.churchMembership.findUniqueOrThrow({
      where: { id: invitation.membershipId },
      include: { user: true },
    });

    const needsPassword = !membership.user.passwordHash;
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
      await tx.churchMembership.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE', joinedAt: new Date() },
      });
      await tx.user.update({
        where: { id: membership.userId },
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
      await tx.auditEvent.create({
        data: {
          churchId: invitation.churchId,
          source: 'feature',
          actorUserId: membership.userId,
          subjectUserId: membership.userId,
          action: 'admin.invitation.accepted',
          entityType: 'user',
          entityId: membership.userId,
          summary: `${membership.user.email} accepted their invitation`,
        },
      });
    });

    this.usage.inc('admin.invitations.accepted', 1, invitation.churchId);
    const { token: sessionToken, session } = await this.sessions.create({
      userId: membership.userId,
      activeChurchId: invitation.churchId,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    // The rest of this request is them, so the answer already describes their
    // portal rather than making the page ask again.
    this.cls.set('sessionId', session.id);
    this.cls.set('userId', membership.userId);
    this.cls.set('actorUserId', membership.userId);
    this.cls.set('churchId', invitation.churchId);
    this.cls.set('platformRole', 'NONE');
    this.cls.set(
      'permissions',
      await this.permissions.forMember(membership.userId, invitation.churchId),
    );
    return { sessionToken };
  }

  /** Roles an administrator may hand out: this church's, of portals that are on. */
  private async assignableRoles(churchId: string, roleIds: string[]) {
    const roles = await this.db.role.findMany({
      where: { id: { in: roleIds }, churchId, deletedAt: null },
    });
    if (roles.length !== roleIds.length) {
      throw new AppError(
        422,
        ErrorCode.ROLE_NOT_AVAILABLE,
        'One of those roles does not exist here.',
      );
    }
    const enabled = new Set(
      (await this.db.churchModule.findMany({ where: { churchId, enabled: true } })).map(
        (m) => m.moduleKey,
      ),
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

  private async pending(churchId: string, userId: string) {
    const membership = await this.db.churchMembership.findUnique({
      where: { churchId_userId: { churchId, userId } },
      include: { user: true },
    });
    if (!membership) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person here.');
    if (membership.status !== 'INVITED') {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'That person has already accepted, or their access was disabled.',
      );
    }
    const invitation = await this.db.invitation.findFirst({
      where: { membershipId: membership.id, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { membership, invitation };
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

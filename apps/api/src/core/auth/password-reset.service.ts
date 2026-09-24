import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode, normalizeEmail } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { PrismaDb } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../email/email.service.js';
import { UsageService } from '../usage/usage.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { newToken, tokenHash } from './tokens.js';
import { PermissionResolver } from '../rbac/permission-resolver.service.js';
import type { RequestContext } from '../context/request-context.js';

const VALID_HOURS = 1;

/**
 * Forgotten passwords, without telling anyone which addresses have accounts:
 * asking always gets the same answer, and only a real, active account gets an
 * email. Resetting signs out every other session, because a password is
 * usually reset when something has gone wrong.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    private readonly db: PrismaDb,
    private readonly config: AppConfig,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly permissions: PermissionResolver,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async request(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') {
      this.logger.log({ msg: 'password reset asked for an address with no active account' });
      return;
    }

    const token = newToken();
    await this.db.$transaction(async (tx) => {
      // Older links stop working, so only the newest one can be used.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + VALID_HOURS * 3_600_000),
        },
      });
      await this.email.enqueue(tx, {
        to: email,
        template: 'password-reset',
        payload: {
          personName: user.fullName,
          link: `${this.config.get('PORTAL_ORIGIN')}/reset-password?token=${token}`,
          hours: VALID_HOURS,
        },
      });
    });
    this.usage.inc('auth.password_resets', 1);
    await this.audit.recordNow({ action: 'auth.password_reset.requested' });
  }

  async reset(
    token: string,
    password: string,
    context: { ip: string | null; userAgent: string | null },
  ): Promise<{ sessionToken: string }> {
    const row = await this.db.passwordResetToken.findUnique({
      where: { tokenHash: tokenHash(token) },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new AppError(
        410,
        ErrorCode.INVITATION_INVALID,
        'This link has been used or has expired. Ask for a new one.',
      );
    }
    const problem = this.passwords.check(password);
    if (problem) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That password cannot be used.', {
        password: [
          problem === 'too_short'
            ? 'Use at least 10 characters'
            : problem === 'too_long'
              ? 'Use at most 128 characters'
              : 'That password appears in lists of breached passwords',
        ],
      });
    }

    const hash = await this.passwords.hash(password);
    await this.db.$transaction(async (tx) => {
      await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash: hash,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
    });
    // Everything signed in before now is signed out: passwordChangedAt does it.
    await this.audit.recordNow({ action: 'auth.password_reset.completed' });

    const { token: sessionToken, session } = await this.sessions.create({
      userId: row.userId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    this.cls.set('sessionId', session.id);
    this.cls.set('userId', row.userId);
    this.cls.set('actorUserId', row.userId);
    this.cls.set(
      'permissions',
      await this.permissions.forUser(row.userId),
    );
    return { sessionToken };
  }
}

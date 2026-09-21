import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@irca/shared';
import { PrismaCore } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../context/request-context.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

/** Rough, and enough for "is this the phone I am holding?". */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Safari\//.test(userAgent)
        ? 'Safari'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : 'A browser';
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iPhone or iPad'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'an unknown system';
  return `${browser} on ${system}`;
}

/** Someone's own details, password and devices. Never anyone else's. */
@Injectable()
export class AccountService {
  constructor(
    private readonly db: PrismaCore,
    private readonly auth: RequestAuth,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async updateProfile(input: { fullName?: string; phone?: string | null }): Promise<void> {
    const userId = this.auth.userId!;
    const before = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    await this.db.user.update({
      where: { id: userId },
      data: {
        ...(input.fullName ? { fullName: input.fullName.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      },
    });
    await this.audit.recordNow({
      action: 'account.profile.updated',
      entityType: 'user',
      entityId: userId,
      summary: 'Changed their own details',
      before: { fullName: before.fullName, phone: before.phone },
      after: input,
    });
  }

  /**
   * Changing a password signs out everywhere else, because it is usually
   * changed when something has gone wrong. This browser stays signed in, with
   * a new session.
   */
  async changePassword(current: string, next: string): Promise<{ sessionToken: string }> {
    const userId = this.auth.userId!;
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await this.passwords.verify(user.passwordHash, current))) {
      throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'That is not your current password.');
    }
    const problem = this.passwords.check(next);
    if (problem) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That password cannot be used.', {
        newPassword: [
          problem === 'too_short'
            ? 'Use at least 10 characters'
            : problem === 'too_long'
              ? 'Use at most 128 characters'
              : 'That password appears in lists of breached passwords',
        ],
      });
    }

    const hash = await this.passwords.hash(next);
    const session = await this.db.session.findUniqueOrThrow({
      where: { id: this.cls.get('sessionId')! },
    });
    await this.db.user.update({
      where: { id: userId },
      data: { passwordHash: hash, passwordChangedAt: new Date() },
    });
    await this.audit.recordNow({
      action: 'account.password.changed',
      entityType: 'user',
      entityId: userId,
    });

    const fresh = await this.sessions.create({
      userId,
      activeChurchId: session.activeChurchId,
      ip: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
    });
    return { sessionToken: fresh.token };
  }

  /** The browsers signed in as this person. Not anyone viewing as them. */
  async sessionsList() {
    const userId = this.auth.userId!;
    const current = this.cls.get('sessionId');
    const rows = await this.db.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      device: describeDevice(s.userAgent),
      ip: s.ip,
      startedAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      isThisOne: s.id === current,
    }));
  }

  async revokeSession(sessionId: string): Promise<void> {
    const userId = this.auth.userId!;
    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No such device.');
    }
    await this.sessions.revoke(sessionId, 'signed-out-by-owner');
  }

  async revokeOtherSessions(): Promise<void> {
    await this.sessions.revokeAllForUser(
      this.auth.userId!,
      'signed-out-elsewhere',
      this.cls.get('sessionId') ?? undefined,
    );
  }
}

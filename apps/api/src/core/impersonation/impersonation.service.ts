import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@irca/shared';
import { PrismaDb } from '../database/prisma-clients.js';
import { insertAuditEvent } from '../audit/audit.service.js';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { UsageService } from '../usage/usage.service.js';
import { PermissionResolver } from '../rbac/permission-resolver.service.js';
import type { RequestContext } from '../context/request-context.js';
import type { ImpersonationSession, Session } from '../../generated/prisma/client.js';
import { impersonationRefusal } from './policy.js';

/** Long enough to look into a problem, short enough to be forgotten safely. */
const MINUTES = 30;

/**
 * Viewing the portal as someone else.
 *
 * It changes nothing but the actor's own session: which person the request
 * acts as, and which church. Everything about it is recorded, and only devs
 * can read that record (D16). The person viewed is never told.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    private readonly db: PrismaDb,
    private readonly cls: ClsService<RequestContext>,
    private readonly auth: RequestAuth,
    private readonly usage: UsageService,
    private readonly permissions: PermissionResolver,
  ) {}

  async start(subjectUserId: string): Promise<void> {
    const sessionId = this.cls.get('sessionId');
    const actorId = this.auth.actorUserId;
    if (!sessionId || !actorId)
      throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please sign in.');

    const subject = await this.db.user.findUnique({ where: { id: subjectUserId } });
    if (!subject) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such person.');

    const refusal = impersonationRefusal(
      {
        id: actorId,
        canImpersonate: this.auth.hasAny('admin.users.impersonate', 'dev.users.impersonate'),
        alreadyImpersonating: this.auth.isImpersonating,
      },
      { subject },
    );
    if (refusal) throw new AppError(403, ErrorCode.FORBIDDEN, refusal);

    const started = await this.db.$transaction(async (tx) => {
      const impersonation = await tx.impersonationSession.create({
        data: {
          sessionId,
          actorUserId: actorId,
          subjectUserId,
          expiresAt: new Date(Date.now() + MINUTES * 60_000),
        },
      });
      await tx.session.update({
        where: { id: sessionId },
        data: { impersonationId: impersonation.id },
      });
      await insertAuditEvent(tx, {
        source: 'core',
        actorUserId: actorId,
        subjectUserId,
        impersonationId: impersonation.id,
        action: 'impersonation.started',
        summary: `${actorId} started viewing as ${subjectUserId}`,
        ip: this.cls.get('ip'),
        userAgent: this.cls.get('userAgent'),
        requestId: this.cls.getId() ?? null,
      });
      return impersonation;
    });

    this.usage.inc('impersonation.started');
    // The rest of this request already acts as the subject, so the answer to
    // it describes what the portal is about to show.
    await this.actAsSubject(started.id, subjectUserId);
  }

  /**
   * Whether the person asking could view as this person right now. The People
   * page uses it to decide whether to offer the button at all.
   */
  async canImpersonate(subjectUserId: string): Promise<boolean> {
    const canImpersonate = this.auth.hasAny('admin.users.impersonate', 'dev.users.impersonate');
    if (!canImpersonate) return false;
    const subject = await this.db.user.findUnique({ where: { id: subjectUserId } });
    if (!subject) return false;
    return (
      impersonationRefusal(
        {
          id: this.auth.actorUserId!,
          canImpersonate,
          alreadyImpersonating: this.auth.isImpersonating,
        },
        { subject },
      ) === null
    );
  }

  /** Ends the impersonation this session is in, if any. */
  async stop(reason: 'STOPPED' | 'LOGOUT' = 'STOPPED'): Promise<void> {
    const sessionId = this.cls.get('sessionId');
    if (!sessionId) return;
    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session?.impersonationId) return;
    const impersonation = await this.db.impersonationSession.findUnique({
      where: { id: session.impersonationId },
    });
    if (!impersonation) return;
    await this.end(session, impersonation, reason);

    // The rest of this request is the actor again.
    this.cls.set('userId', impersonation.actorUserId);
    this.cls.set('impersonationId', null);
    this.cls.set('permissions', await this.permissions.forUser(impersonation.actorUserId));
  }

  /** Makes the rest of this request act as the person being viewed as. */
  private async actAsSubject(impersonationId: string, subjectUserId: string): Promise<void> {
    this.cls.set('userId', subjectUserId);
    this.cls.set('impersonationId', impersonationId);
    this.cls.set(
      'permissions',
      this.permissions.readOnly(await this.permissions.forUser(subjectUserId)),
    );
  }

  /**
   * What the session guard calls on every request: the impersonation this
   * session is in, or null once it has ended or run out of time.
   */
  async forSession(session: Session): Promise<ImpersonationSession | null> {
    if (!session.impersonationId) return null;
    const impersonation = await this.db.impersonationSession.findUnique({
      where: { id: session.impersonationId },
    });
    if (!impersonation) {
      await this.db.session.update({ where: { id: session.id }, data: { impersonationId: null } });
      return null;
    }
    if (impersonation.endedAt) {
      await this.db.session.update({ where: { id: session.id }, data: { impersonationId: null } });
      return null;
    }
    if (impersonation.expiresAt.getTime() <= Date.now()) {
      await this.end(session, impersonation, 'EXPIRED');
      return null;
    }
    return impersonation;
  }

  /**
   * Ends impersonations nobody came back to. The session guard already ends an
   * expired one on the next request, but an abandoned tab would otherwise leave
   * it looking open in the log for ever.
   */
  async expireOverdue(): Promise<{ ended: number }> {
    const overdue = await this.db.impersonationSession.findMany({
      where: { endedAt: null, expiresAt: { lt: new Date() } },
      take: 200,
    });
    for (const impersonation of overdue) {
      const session = await this.db.session.findUnique({ where: { id: impersonation.sessionId } });
      if (session) await this.end(session, impersonation, 'EXPIRED');
      else {
        await this.db.impersonationSession.update({
          where: { id: impersonation.id },
          data: { endedAt: new Date(), endReason: 'EXPIRED' },
        });
      }
    }
    return { ended: overdue.length };
  }

  private async end(
    session: Session,
    impersonation: ImpersonationSession,
    reason: 'STOPPED' | 'EXPIRED' | 'LOGOUT' | 'REVOKED',
  ): Promise<void> {
    const minutes = Math.max(
      0,
      Math.round((Date.now() - impersonation.startedAt.getTime()) / 60_000),
    );
    await this.db.$transaction(async (tx) => {
      await tx.impersonationSession.update({
        where: { id: impersonation.id },
        data: { endedAt: new Date(), endReason: reason },
      });
      await tx.session.update({
        where: { id: session.id },
        // Back to the church the actor was working in before.
        data: { impersonationId: null },
      });
      await insertAuditEvent(tx, {
        source: 'core',
        actorUserId: impersonation.actorUserId,
        subjectUserId: impersonation.subjectUserId,
        impersonationId: impersonation.id,
        action: 'impersonation.ended',
        summary: `${reason.toLowerCase()} after ${minutes} min`,
        meta: { reason, minutes },
        requestId: this.cls.getId() ?? null,
      });
    });
    this.usage.inc('impersonation.minutes');
  }
}

import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { PrismaCore } from '../database/prisma-clients.js';
import type { Session, User } from '../../generated/prisma/client.js';
import { newToken, tokenHash } from './tokens.js';

export type ResolvedSession = { session: Session; user: User };

const TOUCH_EVERY_MS = 5 * 60_000;

/**
 * Server-side sessions. The browser holds a random token; the database holds
 * its hash, the user it belongs to and the church it is working in. Because the
 * row is checked on every request, signing out, disabling someone, changing a
 * password or ending an impersonation takes effect on the very next request.
 *
 * Uses the core connection: sessions are looked up before any church is known,
 * and must stay writable while impersonating.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly db: PrismaCore,
    private readonly config: AppConfig,
  ) {}

  async create(input: {
    userId: string;
    activeChurchId: string | null;
    ip: string | null;
    userAgent: string | null;
  }): Promise<{ token: string; session: Session }> {
    const token = newToken();
    const session = await this.db.session.create({
      data: {
        tokenHash: tokenHash(token),
        userId: input.userId,
        activeChurchId: input.activeChurchId,
        ip: input.ip,
        userAgent: input.userAgent,
        expiresAt: new Date(Date.now() + this.config.get('SESSION_ABSOLUTE_HOURS') * 3_600_000),
      },
    });
    return { token, session };
  }

  /** The session behind a cookie, or null if it no longer lets anyone in. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const found = await this.db.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: true },
    });
    if (!found) return null;

    const now = Date.now();
    const idleLimit = now - this.config.get('SESSION_IDLE_HOURS') * 3_600_000;
    const { user, ...session } = found;

    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() < now) return null;
    if (session.lastSeenAt.getTime() < idleLimit) return null;
    if (user.status !== 'ACTIVE') return null;
    // A password change signs out every session made before it.
    if (user.passwordChangedAt && user.passwordChangedAt > session.createdAt) return null;

    const checked = await this.checkActiveChurch(session, user);

    if (now - checked.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      // Throttled so a busy page does not write on every request.
      await this.db.session.update({ where: { id: checked.id }, data: { lastSeenAt: new Date() } });
    }
    return { session: checked, user };
  }

  /**
   * The church the session works in must still be one this person may use.
   * If it is not (membership disabled, church suspended), the session survives
   * but loses the church, and the person picks another or sees "no access".
   */
  private async checkActiveChurch(session: Session, user: User): Promise<Session> {
    if (!session.activeChurchId) return session;
    const membership = await this.db.churchMembership.findUnique({
      where: { churchId_userId: { churchId: session.activeChurchId, userId: user.id } },
      include: { church: true },
    });
    const usable =
      membership?.status === 'ACTIVE' &&
      (membership.church.status === 'ACTIVE' || user.platformRole === 'DEV');
    if (usable) return session;
    return this.db.session.update({ where: { id: session.id }, data: { activeChurchId: null } });
  }

  /** For the session guard, which needs the impersonated person's own record. */
  userById(userId: string) {
    return this.db.user.findUnique({ where: { id: userId } });
  }

  /** Revoked, never deleted: the dev console counts them, and they explain sign-outs. */
  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
    await this.db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  /**
   * The church a fresh sign-in starts in: the person's only church if they have
   * one, otherwise the one they joined first. Null for devs and for anyone with
   * no active membership, who then see "no access".
   */
  async defaultChurchFor(userId: string): Promise<string | null> {
    const first = await this.db.churchMembership.findFirst({
      where: { userId, status: 'ACTIVE', church: { status: 'ACTIVE' } },
      orderBy: [{ joinedAt: 'asc' }, { createdAt: 'asc' }],
      select: { churchId: true },
    });
    return first?.churchId ?? null;
  }
}

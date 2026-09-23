import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode, type LoginInput } from '@irca/shared';
import { PrismaDb } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import type { RequestContext } from '../context/request-context.js';
import { UsageService } from '../usage/usage.service.js';
import { PermissionResolver } from '../rbac/permission-resolver.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;

// One message for a wrong password, an unknown email and a disabled account,
// so the sign-in form cannot be used to find out who has an account.
const INVALID = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly db: PrismaDb,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly cls: ClsService<RequestContext>,
    private readonly permissions: PermissionResolver,
    private readonly usage: UsageService,
  ) {}

  /** Checks the credentials and opens a session. Returns the raw token for the cookie. */
  async login(input: LoginInput): Promise<{ token: string }> {
    const user = await this.db.user.findUnique({ where: { email: input.email } });

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError(
        429,
        ErrorCode.ACCOUNT_LOCKED,
        'Too many attempts. Try again in 15 minutes.',
      );
    }

    const ok = await this.passwords.verify(user?.passwordHash ?? null, input.password);
    if (!user || !ok || user.status !== 'ACTIVE') {
      if (user) await this.recordFailure(user.id, user.failedLoginCount);
      // No church yet: a failed sign-in is counted for the platform.
      this.usage.inc('auth.login_failures', 1, null);
      // The address is hashed, never logged: repeated attacks on one address
      // stay visible without keeping the emails of people with no account.
      this.logger.log({
        msg: 'sign-in failed',
        userId: user?.id,
        emailHash: createHash('sha256').update(input.email).digest('hex').slice(0, 16),
      });
      throw INVALID();
    }

    // A sign-in always gets a new token, so an old one someone copied dies here.
    const previous = this.cls.get('sessionId');
    if (previous) await this.sessions.revoke(previous, 'relogin');

    const rehash = user.passwordHash && this.passwords.needsRehash(user.passwordHash);
    await this.db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(rehash ? { passwordHash: await this.passwords.hash(input.password) } : {}),
      },
    });

    const { token, session } = await this.sessions.create({
      userId: user.id,
      ip: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
    });

    // The rest of this request (building /me) acts as the person who just signed in.
    this.cls.set('sessionId', session.id);
    this.cls.set('userId', user.id);
    this.cls.set('actorUserId', user.id);
    this.cls.set('permissions', await this.permissions.forUser(user.id));

    this.usage.inc('auth.logins');
    this.usage.inc('auth.sessions_created');
    this.logger.log({ msg: 'signed in', userId: user.id });
    return { token };
  }

  async logout(): Promise<void> {
    const sessionId = this.cls.get('sessionId');
    if (sessionId) await this.sessions.revoke(sessionId, 'logout');
    this.logger.log({ msg: 'signed out' });
  }

  private async recordFailure(userId: string, failuresSoFar: number): Promise<void> {
    const failures = failuresSoFar + 1;
    if (failures >= MAX_FAILURES) this.usage.inc('auth.lockouts', 1, null);
    await this.db.user.update({
      where: { id: userId },
      data:
        failures >= MAX_FAILURES
          ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
          : { failedLoginCount: failures },
    });
  }
}

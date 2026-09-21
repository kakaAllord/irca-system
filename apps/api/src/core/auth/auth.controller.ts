import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { LoginSchema, type LoginInput, type MeResponse } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { AuthenticatedOnly } from './decorators.js';
import { ClsService } from 'nestjs-cls';
import type { RequestContext } from '../context/request-context.js';
import { AuthService } from './auth.service.js';
import { MeService } from './me.service.js';
import { clearedSessionCookieOptions, sessionCookieOptions } from './session.cookie.js';
import { AllowWhileImpersonating } from '../impersonation/decorators.js';
import { ImpersonationService } from '../impersonation/impersonation.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { Public } from './decorators.js';

const SwitchChurchSchema = z.object({ churchId: z.uuid() });
const ForgotSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) });
const ResetSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(200),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly meService: MeService,
    private readonly config: AppConfig,
    private readonly impersonation: ImpersonationService,
    private readonly resets: PasswordResetService,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  /**
   * Always answers the same way, whether or not the address has an account,
   * so this cannot be used to find out who has one.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body(new ZodPipe(ForgotSchema)) body: { email: string }) {
    await this.resets.request(body.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body(new ZodPipe(ResetSchema)) body: { token: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { sessionToken } = await this.resets.reset(body.token, body.password, {
      ip: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
    });
    res.cookie(
      this.config.get('SESSION_COOKIE_NAME'),
      sessionToken,
      sessionCookieOptions(this.config),
    );
    return this.meService.build();
  }

  /** Ten tries a minute from one address, on top of the per-account lock. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { token } = await this.auth.login(body);
    res.cookie(this.config.get('SESSION_COOKIE_NAME'), token, sessionCookieOptions(this.config));
    return this.meService.build();
  }

  @AuthenticatedOnly()
  @AllowWhileImpersonating()
  @Post('logout')
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    // Signing out while viewing as someone ends that first, so the log says
    // how it ended rather than leaving it open.
    await this.impersonation.stop('LOGOUT');
    await this.auth.logout();
    res.clearCookie(
      this.config.get('SESSION_COOKIE_NAME'),
      clearedSessionCookieOptions(this.config),
    );
  }

  @AuthenticatedOnly()
  @Get('me')
  me(): Promise<MeResponse> {
    return this.meService.build();
  }

  /**
   * Who to ask for access. Shown to someone who is signed in but has been
   * given nothing yet, so they know whose door to knock on.
   */
  @AuthenticatedOnly()
  @Get('admins')
  admins(): Promise<{ name: string }[]> {
    return this.meService.administrators();
  }

  /** For someone who serves more than one church. Not allowed while viewing as someone. */
  @AuthenticatedOnly()
  @Post('church')
  @HttpCode(200)
  async switchChurch(
    @Body(new ZodPipe(SwitchChurchSchema)) body: { churchId: string },
  ): Promise<MeResponse> {
    await this.auth.switchChurch(body.churchId);
    return this.meService.build();
  }
}

import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { LoginSchema, type LoginInput, type MeResponse } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { AuthenticatedOnly, Public } from './decorators.js';
import { AuthService } from './auth.service.js';
import { MeService } from './me.service.js';
import { clearedSessionCookieOptions, sessionCookieOptions } from './session.cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly meService: MeService,
    private readonly config: AppConfig,
  ) {}

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
  @Post('logout')
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
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
}

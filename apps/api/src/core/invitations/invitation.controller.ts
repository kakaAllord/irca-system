import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClsService } from 'nestjs-cls';
import type { Response } from 'express';
import { z } from 'zod';
import { PASSWORD_MAX, type MeResponse } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { Public } from '../auth/decorators.js';
import { MeService } from '../auth/me.service.js';
import { sessionCookieOptions } from '../auth/session.cookie.js';
import type { RequestContext } from '../context/request-context.js';
import { InvitationService } from './invitation.service.js';

const AcceptSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX).optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
});

/** Public, because the person has no account yet. The token is the identity. */
@Controller('invitations')
export class InvitationController {
  constructor(
    private readonly invitations: InvitationService,
    private readonly me: MeService,
    private readonly config: AppConfig,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  describe(@Param('token') token: string) {
    return this.invitations.describe(token);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body(new ZodPipe(AcceptSchema)) body: z.infer<typeof AcceptSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { sessionToken } = await this.invitations.accept(token, body, {
      ip: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
    });
    res.cookie(
      this.config.get('SESSION_COOKIE_NAME'),
      sessionToken,
      sessionCookieOptions(this.config),
    );
    return this.me.build();
  }
}

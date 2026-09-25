import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { PASSWORD_MAX } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { AuthenticatedOnly } from './decorators.js';
import { AccountService } from './account.service.js';
import { sessionCookieOptions } from './session.cookie.js';

const ProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
});
const MessagesSchema = z.object({ optOut: z.boolean() });
const PasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: z.string().min(1).max(PASSWORD_MAX),
});

/** Everyone's own account. Nothing here can touch anyone else's. */
@Controller('me')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly config: AppConfig,
  ) {}

  @AuthenticatedOnly()
  @Patch()
  @HttpCode(204)
  updateProfile(@Body(new ZodPipe(ProfileSchema)) body: z.infer<typeof ProfileSchema>) {
    return this.account.updateProfile(body);
  }

  /** Whether the church may text them, and the number it would use. */
  @AuthenticatedOnly()
  @Get('messages')
  messages() {
    return this.account.messages();
  }

  @AuthenticatedOnly()
  @Put('messages')
  @HttpCode(204)
  setMessages(@Body(new ZodPipe(MessagesSchema)) body: { optOut: boolean }) {
    return this.account.setMessages(body.optOut);
  }

  @AuthenticatedOnly()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @Body(new ZodPipe(PasswordSchema)) body: z.infer<typeof PasswordSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { sessionToken } = await this.account.changePassword(
      body.currentPassword,
      body.newPassword,
    );
    res.cookie(
      this.config.get('SESSION_COOKIE_NAME'),
      sessionToken,
      sessionCookieOptions(this.config),
    );
  }

  @AuthenticatedOnly()
  @Get('sessions')
  sessions() {
    return this.account.sessionsList();
  }

  @AuthenticatedOnly()
  @Delete('sessions/:sessionId')
  @HttpCode(204)
  revoke(@Param('sessionId') sessionId: string) {
    return this.account.revokeSession(sessionId);
  }

  @AuthenticatedOnly()
  @Delete('sessions')
  @HttpCode(204)
  revokeOthers() {
    return this.account.revokeOtherSessions();
  }
}

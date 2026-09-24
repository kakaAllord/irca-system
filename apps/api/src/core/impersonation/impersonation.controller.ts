import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import type { MeResponse } from '@irca/shared';
import { ZodPipe } from '../http/zod.pipe.js';
import { AuthenticatedOnly } from '../auth/decorators.js';
import { MeService } from '../auth/me.service.js';
import { RequireAnyPermission, WriteWithReadPermission } from '../rbac/decorators.js';
import { AllowWhileImpersonating } from './decorators.js';
import { ImpersonationService } from './impersonation.service.js';

/** No reason is asked for: who, whom, where and when is the whole record (D16). */
const StartSchema = z.object({
  subjectUserId: z.uuid(),
  /** Devs say which church; an administrator's own church is used. */
});

@Controller('impersonation')
export class ImpersonationController {
  constructor(
    private readonly impersonation: ImpersonationService,
    private readonly me: MeService,
  ) {}

  @RequireAnyPermission('admin.users.impersonate', 'dev.users.impersonate')
  @WriteWithReadPermission("changes only the actor's own session, and grants read-only access")
  @Post()
  @HttpCode(200)
  async start(
    @Body(new ZodPipe(StartSchema)) body: z.infer<typeof StartSchema>,
  ): Promise<MeResponse> {
    await this.impersonation.start(body.subjectUserId);
    // The portal reloads into the subject's view from this.
    return this.me.build();
  }

  @AuthenticatedOnly()
  @AllowWhileImpersonating()
  @Delete()
  @HttpCode(200)
  async stop(): Promise<MeResponse> {
    await this.impersonation.stop('STOPPED');
    return this.me.build();
  }
}

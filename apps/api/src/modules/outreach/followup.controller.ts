import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { FOLLOW_UPS, FollowupService } from './followup.service.js';

const FollowUpSchema = z.object({
  kind: z.enum(FOLLOW_UPS),
  note: z.string().trim().max(160).optional(),
  on: z.iso.date('A date such as 2026-09-26').optional(),
  done: z.boolean().optional(),
});

/** Following up the people Outreach reached, and their timelines. */
@Controller('outreach')
export class FollowupController {
  constructor(private readonly followup: FollowupService) {}

  @RequirePermission('outreach.reached.read')
  @Get('followup')
  pending() {
    return this.followup.pending();
  }

  @RequirePermission('outreach.reached.read')
  @Get('people/:personId')
  person(@Param('personId') personId: string) {
    return this.followup.person(personId);
  }

  @RequirePermission('outreach.reached.record')
  @Post('people/:personId/followups')
  @HttpCode(204)
  record(
    @Param('personId') personId: string,
    @Body(new ZodPipe(FollowUpSchema)) body: z.infer<typeof FollowUpSchema>,
  ) {
    return this.followup.record(personId, body);
  }
}

import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { ApplicationStatus } from '../../../generated/prisma/client.js';
import { ZodPipe } from '../../../core/http/zod.pipe.js';
import { RequirePermission } from '../../../core/rbac/decorators.js';
import { ApplicationsService } from './applications.service.js';

const STATUSES = ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CONFIRMED', 'WITHDRAWN'] as const;
const SubmitSchema = z.object({ personId: z.uuid(), note: z.string().trim().max(1000).optional() });
const NoteSchema = z.object({ note: z.string().trim().max(1000).optional() });
const ReasonSchema = z.object({
  reason: z.string().trim().min(3, 'Say why, for the record').max(500),
});

/** The pastors' decisions. Deciding is its own permission, and theirs alone. */
@Controller('membership/applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @RequirePermission('membership.applications.read')
  @Get()
  list(@Query('status') status?: string) {
    return this.applications.list(
      STATUSES.includes(status as ApplicationStatus) ? (status as ApplicationStatus) : undefined,
    );
  }

  @RequirePermission('membership.applications.submit')
  @Post()
  submit(@Body(new ZodPipe(SubmitSchema)) body: { personId: string; note?: string }) {
    return this.applications.submit(body.personId, body.note);
  }

  @RequirePermission('membership.applications.decide')
  @Post(':id/approve')
  @HttpCode(204)
  approve(@Param('id') id: string, @Body(new ZodPipe(NoteSchema)) body: { note?: string }) {
    return this.applications.approve(id, body.note);
  }

  @RequirePermission('membership.applications.decide')
  @Post(':id/reject')
  @HttpCode(204)
  reject(@Param('id') id: string, @Body(new ZodPipe(ReasonSchema)) body: { reason: string }) {
    return this.applications.reject(id, body.reason);
  }

  @RequirePermission('membership.applications.decide')
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@Param('id') id: string) {
    return this.applications.confirm(id);
  }

  @RequirePermission('membership.applications.submit')
  @Post(':id/withdraw')
  @HttpCode(204)
  withdraw(@Param('id') id: string) {
    return this.applications.withdraw(id);
  }
}

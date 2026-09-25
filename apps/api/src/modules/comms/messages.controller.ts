import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequireAnyPermission, RequirePermission } from '../../core/rbac/decorators.js';
import { MessagesService } from './messages.service.js';
import { SendingService } from './sending.service.js';
import { OverviewService } from './overview.service.js';

const text = z.string().max(2000).optional();
const SendSchema = z.object({
  departmentId: z.uuid().nullable().default(null),
  audience: z.object({
    key: z.string().max(60),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  templateId: z.uuid().nullable().optional(),
  bodies: z.object({ en: text, sw: text, fr: text }).nullable().optional(),
  fields: z.record(z.string(), z.string().max(60)).default({}),
  scheduledFor: z.iso.datetime({ offset: true }).nullable().optional(),
});

/**
 * Sending and what was sent. Whether this person may send for this
 * department, to these people, with these words, is the service's to check
 * (07 step 7.10); these guards only say what kind of thing.
 */
@Controller('comms/messages')
export class MessagesController {
  constructor(
    private readonly sending: SendingService,
    private readonly messages: MessagesService,
    private readonly overview: OverviewService,
  ) {}

  /** This month by department, the credit, what waits for approval, and replies. */
  @RequirePermission('comms.messages.read')
  @Get('overview')
  month() {
    return this.overview.month();
  }

  @RequireAnyPermission('comms.messages.read', 'comms.department.read')
  @Get()
  list(
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    const scope =
      departmentId === undefined || departmentId === ''
        ? undefined
        : departmentId === 'none'
          ? null
          : departmentId;
    return this.messages.list({ departmentId: scope, status, page: Number(page) || 1 });
  }

  @RequireAnyPermission('comms.messages.read', 'comms.department.read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.messages.get(id);
  }

  /** What a send would do, writing nothing. A POST only because the question has a shape. */
  @RequireAnyPermission('comms.messages.send', 'comms.department.send')
  @Post('preview')
  @HttpCode(200)
  preview(@Body(new ZodPipe(SendSchema)) body: z.infer<typeof SendSchema>) {
    return this.sending.preview(body);
  }

  @RequireAnyPermission('comms.messages.send', 'comms.department.send')
  @Post()
  @HttpCode(201)
  send(@Body(new ZodPipe(SendSchema)) body: z.infer<typeof SendSchema>) {
    return this.sending.send(body);
  }

  @RequireAnyPermission('comms.messages.cancel', 'comms.department.send')
  @Post(':id/cancel')
  @HttpCode(204)
  cancel(@Param('id') id: string) {
    return this.messages.cancel(id);
  }
}

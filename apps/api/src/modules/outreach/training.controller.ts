import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { TrainingService } from './training.service.js';

const TrainingSchema = z.object({
  topic: z.string().trim().min(2, 'What it is about').max(120),
  trainer: z.string().trim().max(80).optional(),
  date: z.iso.date('A date such as 2026-09-25'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time such as 18:00'),
  venue: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});
const MarksSchema = z.object({
  marks: z
    .array(
      z.object({
        personId: z.uuid(),
        mark: z.enum(['ATTENDED', 'MISSED']).nullable(),
      }),
    )
    .min(1)
    .max(300),
});

/** Friday training, and who came. */
@Controller('outreach/trainings')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @RequirePermission('outreach.training.read')
  @Get()
  list() {
    return this.training.list();
  }

  @RequirePermission('outreach.training.read')
  @Get('history')
  history() {
    return this.training.history();
  }

  @RequirePermission('outreach.training.read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.training.get(id);
  }

  @RequirePermission('outreach.training.manage')
  @Post()
  @HttpCode(201)
  create(@Body(new ZodPipe(TrainingSchema)) body: z.infer<typeof TrainingSchema>) {
    return this.training.create(body);
  }

  @RequirePermission('outreach.training.manage')
  @Put(':id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(TrainingSchema)) body: z.infer<typeof TrainingSchema>,
  ) {
    return this.training.update(id, body);
  }

  @RequirePermission('outreach.training.manage')
  @Put(':id/attendance')
  @HttpCode(204)
  mark(@Param('id') id: string, @Body(new ZodPipe(MarksSchema)) body: z.infer<typeof MarksSchema>) {
    return this.training.mark(id, body.marks);
  }
}

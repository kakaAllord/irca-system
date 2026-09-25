import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ReportsService } from './reports.service.js';

const AttachSchema = z.object({
  key: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(200),
});

/**
 * A Saturday's report, as a PDF. The presign route lives with the session
 * rather than as a general /v1/files: which permission covers an upload is
 * the owning module's to say (08 step 8.9).
 */
@Controller('outreach/sessions/:id/report')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermission('outreach.reports.upload')
  @Post('upload')
  @HttpCode(201)
  upload(@Param('id') id: string) {
    return this.reports.uploadPolicy(id);
  }

  @RequirePermission('outreach.reports.upload')
  @Post()
  @HttpCode(201)
  attach(
    @Param('id') id: string,
    @Body(new ZodPipe(AttachSchema)) body: z.infer<typeof AttachSchema>,
  ) {
    return this.reports.attach(id, body);
  }

  @RequirePermission('outreach.reports.read')
  @Get('versions')
  versions(@Param('id') id: string) {
    return this.reports.describe(id);
  }

  /** A link that works for five minutes: to the report, or with ?file= an earlier one. */
  @RequirePermission('outreach.reports.read')
  @Get()
  link(@Param('id') id: string, @Query('file') file?: string) {
    return this.reports.link(id, file && z.uuid().safeParse(file).success ? file : undefined);
  }
}

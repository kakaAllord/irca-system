import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Put,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { validation } from '../../core/http/app-error.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ReportsService } from './reports.service.js';

const Upload = z.object({
  name: z.string().trim().min(1).max(200),
  bytes: z.coerce.number().int().min(1),
});

/**
 * A Saturday's report, as a PDF, kept on the church's own file storage. The
 * routes live with the session rather than as a general /v1/files: which
 * permission covers a file is the owning module's to say (08 step 8.9).
 */
@Controller('outreach/sessions/:id/report')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * The PDF itself is the body, `?name=` its name and `?bytes=` its size, so
   * a body cut short on the way is refused rather than kept.
   */
  @RequirePermission('outreach.reports.upload')
  @Put()
  @HttpCode(201)
  attach(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('content-type') contentType: string | undefined,
    @Req() req: Request,
  ) {
    const parsed = Upload.safeParse(query);
    if (!parsed.success) throw validation(z.flattenError(parsed.error).fieldErrors);
    return this.reports.attach(id, req, {
      ...parsed.data,
      contentType: (contentType ?? '').split(';')[0]!.trim(),
    });
  }

  @RequirePermission('outreach.reports.read')
  @Get('versions')
  versions(@Param('id') id: string) {
    return this.reports.describe(id);
  }

  /** The report, or with ?file= an earlier one, opened in the browser. */
  @RequirePermission('outreach.reports.read')
  @Get()
  // What a report says is not for a shared cache, nor the browser's disk.
  @Header('Cache-Control', 'private, no-store')
  async read(@Param('id') id: string, @Query('file') file?: string) {
    const report = await this.reports.read(
      id,
      file && z.uuid().safeParse(file).success ? file : undefined,
    );
    return new StreamableFile(report.stream, {
      type: 'application/pdf',
      length: report.bytes,
      disposition: `inline; filename="${report.name.replace(/[^\w .()-]/g, '_')}"`,
    });
  }
}

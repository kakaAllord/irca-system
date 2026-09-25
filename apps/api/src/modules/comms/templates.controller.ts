import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequireAnyPermission, RequirePermission } from '../../core/rbac/decorators.js';
import { TemplatesService } from './templates.service.js';

const body = z.string().max(2000).optional();
const TemplateSchema = z.object({
  name: z.string().trim().min(2, 'Name it, so it can be found').max(80),
  bodies: z.object({ en: body, sw: body, fr: body }),
});
const CreateSchema = TemplateSchema.extend({ departmentId: z.uuid().nullable().default(null) });
const ApproveSchema = z.object({ note: z.string().trim().max(500).optional() });
const RejectSchema = z.object({
  note: z.string().trim().min(3, 'Say what needs changing').max(500),
});

/**
 * Templates. Who may do what to which one — Communications or the
 * department's own leaders — is the service's to check; these guards only
 * say what kind of thing.
 */
@Controller('comms/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @RequireAnyPermission('comms.templates.read', 'comms.department.read')
  @Get()
  list(@Query('departmentId') departmentId?: string) {
    // "none" asks for Communications' own; absent asks for every one.
    const scope =
      departmentId === undefined ? undefined : departmentId === 'none' ? null : departmentId;
    return this.templates.list(scope);
  }

  @RequireAnyPermission('comms.templates.read', 'comms.department.read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @RequireAnyPermission('comms.templates.draft', 'comms.department.draft')
  @Post()
  @HttpCode(201)
  create(@Body(new ZodPipe(CreateSchema)) body: z.infer<typeof CreateSchema>) {
    return this.templates.create(body.departmentId, body);
  }

  @RequireAnyPermission('comms.templates.draft', 'comms.department.draft')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(TemplateSchema)) body: z.infer<typeof TemplateSchema>,
  ) {
    return this.templates.update(id, body);
  }

  @RequireAnyPermission('comms.templates.draft', 'comms.department.draft')
  @Post(':id/submit')
  @HttpCode(204)
  submit(@Param('id') id: string) {
    return this.templates.submit(id);
  }

  @RequirePermission('comms.templates.approve')
  @Post(':id/approve')
  @HttpCode(204)
  approve(@Param('id') id: string, @Body(new ZodPipe(ApproveSchema)) body: { note?: string }) {
    return this.templates.approve(id, body.note ?? null);
  }

  @RequirePermission('comms.templates.approve')
  @Post(':id/reject')
  @HttpCode(204)
  reject(@Param('id') id: string, @Body(new ZodPipe(RejectSchema)) body: { note: string }) {
    return this.templates.reject(id, body.note);
  }

  @RequireAnyPermission('comms.templates.draft', 'comms.department.draft')
  @Post(':id/retire')
  @HttpCode(204)
  retire(@Param('id') id: string) {
    return this.templates.retire(id);
  }
}

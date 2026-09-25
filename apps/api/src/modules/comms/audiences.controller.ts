import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequireAnyPermission, RequirePermission } from '../../core/rbac/decorators.js';
import { AudiencesService } from './audiences.service.js';

const CountSchema = z.object({
  departmentId: z.uuid().nullable().default(null),
  audience: z.object({
    key: z.string().max(60),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
});

/** Who messages can go to, and which departments may use the church-wide ones. */
@Controller('comms')
export class AudiencesController {
  constructor(private readonly audiences: AudiencesService) {}

  @RequirePermission('comms.audiences.read')
  @Get('audiences')
  list() {
    return this.audiences.list();
  }

  @RequirePermission('comms.audiences.manage')
  @Put('audiences/:key/departments/:departmentId')
  @HttpCode(204)
  grant(@Param('key') key: string, @Param('departmentId') departmentId: string) {
    return this.audiences.grant(key, departmentId);
  }

  @RequirePermission('comms.audiences.manage')
  @Delete('audiences/:key/departments/:departmentId')
  @HttpCode(204)
  revoke(@Param('key') key: string, @Param('departmentId') departmentId: string) {
    return this.audiences.revoke(key, departmentId);
  }

  /** What the composer may offer this sender, for Communications or one department. */
  @RequireAnyPermission('comms.messages.send', 'comms.department.send')
  @Get('audience-options')
  options(@Query('departmentId') departmentId?: string) {
    return this.audiences.options(departmentId || null);
  }

  /**
   * How many a choice reaches, before anything is written. A POST because the
   * choice has a shape; it changes nothing.
   */
  @RequireAnyPermission('comms.messages.send', 'comms.department.send')
  @Post('audience-count')
  @HttpCode(200)
  count(@Body(new ZodPipe(CountSchema)) body: z.infer<typeof CountSchema>) {
    return this.audiences.count(body.departmentId, body.audience.key, body.audience.params);
  }
}

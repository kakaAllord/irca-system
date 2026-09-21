import { Body, Controller, Get, HttpCode, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ChurchModulesService } from './church-modules.service.js';

const EnabledSchema = z.object({ enabled: z.boolean() });

@Controller('admin/modules')
export class ChurchModulesController {
  constructor(private readonly modules: ChurchModulesService) {}

  @RequirePermission('admin.modules.read')
  @Get()
  list() {
    return this.modules.list();
  }

  @RequirePermission('admin.modules.manage')
  @Put(':moduleKey')
  @HttpCode(204)
  setEnabled(
    @Param('moduleKey') moduleKey: string,
    @Body(new ZodPipe(EnabledSchema)) body: { enabled: boolean },
  ) {
    return this.modules.setEnabled(moduleKey, body.enabled);
  }
}

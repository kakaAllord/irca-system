import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { RolesService } from './roles.service.js';

const CreateSchema = z.object({
  moduleKey: z.string().min(1).max(40),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(''),
  permissionKeys: z.array(z.string().max(80)).min(1, 'Choose at least one thing this role can do'),
});
const UpdateSchema = CreateSchema.omit({ moduleKey: true });

@Controller('admin/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermission('admin.roles.read')
  @Get()
  list(@Query('assignable') assignable?: string) {
    return this.roles.list(assignable === 'true');
  }

  @RequirePermission('admin.roles.read')
  @Get('catalogue/:moduleKey')
  catalogue(@Param('moduleKey') moduleKey: string) {
    return this.roles.catalogue(moduleKey);
  }

  @RequirePermission('admin.roles.manage')
  @Post()
  @HttpCode(201)
  create(@Body(new ZodPipe(CreateSchema)) body: z.infer<typeof CreateSchema>) {
    return this.roles.create(body);
  }

  @RequirePermission('admin.roles.manage')
  @Patch(':roleId')
  @HttpCode(204)
  update(
    @Param('roleId') roleId: string,
    @Body(new ZodPipe(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
  ) {
    return this.roles.update(roleId, body);
  }

  @RequirePermission('admin.roles.manage')
  @Delete(':roleId')
  @HttpCode(204)
  remove(@Param('roleId') roleId: string) {
    return this.roles.remove(roleId);
  }
}

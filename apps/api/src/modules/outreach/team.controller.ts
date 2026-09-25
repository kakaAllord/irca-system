import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { TeamService } from './team.service.js';

const GroupSchema = z.object({
  name: z.string().trim().min(2, 'Name the group').max(60),
  personIds: z.array(z.uuid()).max(10),
});
const ActiveSchema = z.object({ active: z.boolean() });

/**
 * The Outreach team and its partner groups. The team itself is kept in My
 * departments by the department's leaders; nothing here adds anyone to it.
 */
@Controller('outreach')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @RequirePermission('outreach.team.read')
  @Get('team')
  list() {
    return this.team.team();
  }

  @RequirePermission('outreach.groups.manage')
  @Post('groups')
  @HttpCode(201)
  create(@Body(new ZodPipe(GroupSchema)) body: z.infer<typeof GroupSchema>) {
    return this.team.createGroup(body);
  }

  @RequirePermission('outreach.groups.manage')
  @Put('groups/:id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(GroupSchema)) body: z.infer<typeof GroupSchema>,
  ) {
    return this.team.updateGroup(id, body);
  }

  @RequirePermission('outreach.groups.manage')
  @Put('groups/:id/active')
  @HttpCode(204)
  setActive(@Param('id') id: string, @Body(new ZodPipe(ActiveSchema)) body: { active: boolean }) {
    return this.team.setGroupActive(id, body.active);
  }
}

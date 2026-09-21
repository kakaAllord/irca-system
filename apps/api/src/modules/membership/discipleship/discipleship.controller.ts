import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../../core/http/zod.pipe.js';
import { RequirePermission } from '../../../core/rbac/decorators.js';
import { DiscipleshipService } from './discipleship.service.js';

const GroupSchema = z.object({ name: z.string().trim().min(2, 'Name the group').max(60) });
const GroupPatchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  isActive: z.boolean().optional(),
});
const EnrollSchema = z.object({ personId: z.uuid(), groupId: z.uuid() });
const MarkSchema = z.object({
  enrollmentId: z.uuid(),
  sessionNo: z.number().int().min(1).max(52),
  mark: z.enum(['ATTENDED', 'MISSED']).nullable(),
});
const MarkAllSchema = z.object({ attendedEnrollmentIds: z.array(z.uuid()).max(500) });

/** The foundation class: groups, sign-ups, the register and the board. */
@Controller('membership/discipleship')
export class DiscipleshipController {
  constructor(private readonly discipleship: DiscipleshipService) {}

  @RequirePermission('membership.discipleship.read')
  @Get('board')
  board(@Query('group') group?: string) {
    return this.discipleship.board(group || undefined);
  }

  @RequirePermission('membership.discipleship.read')
  @Get('register')
  register(@Query('group') group: string) {
    return this.discipleship.register(group);
  }

  @RequirePermission('membership.discipleship.read')
  @Get('groups')
  groups() {
    return this.discipleship.groups();
  }

  @RequirePermission('membership.discipleship.manage')
  @Post('groups')
  createGroup(@Body(new ZodPipe(GroupSchema)) body: { name: string }) {
    return this.discipleship.createGroup(body.name);
  }

  @RequirePermission('membership.discipleship.manage')
  @Patch('groups/:id')
  @HttpCode(204)
  updateGroup(
    @Param('id') id: string,
    @Body(new ZodPipe(GroupPatchSchema)) body: { name?: string; isActive?: boolean },
  ) {
    return this.discipleship.updateGroup(id, body);
  }

  @RequirePermission('membership.discipleship.manage')
  @Post('enrollments')
  enroll(@Body(new ZodPipe(EnrollSchema)) body: { personId: string; groupId: string }) {
    return this.discipleship.enroll(body.personId, body.groupId);
  }

  @RequirePermission('membership.discipleship.manage')
  @Post('enrollments/:id/drop')
  @HttpCode(204)
  drop(@Param('id') id: string) {
    return this.discipleship.drop(id);
  }

  @RequirePermission('membership.discipleship.manage')
  @Put('attendance')
  @HttpCode(204)
  mark(@Body(new ZodPipe(MarkSchema)) body: z.infer<typeof MarkSchema>) {
    return this.discipleship.mark(body.enrollmentId, body.sessionNo, body.mark);
  }

  @RequirePermission('membership.discipleship.manage')
  @Post('groups/:id/sessions/:no/mark-all')
  @HttpCode(204)
  markAll(
    @Param('id') id: string,
    @Param('no') no: string,
    @Body(new ZodPipe(MarkAllSchema)) body: { attendedEnrollmentIds: string[] },
  ) {
    return this.discipleship.markAll(id, Number(no), body.attendedEnrollmentIds);
  }
}

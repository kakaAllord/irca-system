import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { DepartmentsService } from './departments.service.js';

const DepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name the department').max(80),
  description: z.string().trim().max(300).default(''),
  moduleKey: z.string().trim().max(40).nullable().default(null),
});
const LeaderSchema = z.object({
  personId: z.uuid(),
  title: z.string().trim().min(2, 'Give their title, such as Chairperson').max(60),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('That does not look like an email').max(254))
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
const ArchiveSchema = z.object({ archived: z.boolean() });

/**
 * The administrators' side of departments: the list, their portals, and
 * their leaders. Members are kept on the shared routes in
 * DepartmentsController, which a department's own leaders use too.
 */
@Controller('admin/departments')
export class AdminDepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @RequirePermission('admin.departments.read')
  @Get()
  list() {
    return this.departments.list();
  }

  @RequirePermission('admin.departments.manage')
  @Get('leader-candidates')
  leaderCandidates(@Query('q') q = '') {
    return this.departments.leaderCandidates(q);
  }

  @RequirePermission('admin.departments.manage')
  @Post()
  @HttpCode(201)
  create(@Body(new ZodPipe(DepartmentSchema)) body: z.infer<typeof DepartmentSchema>) {
    return this.departments.create(body);
  }

  @RequirePermission('admin.departments.manage')
  @Put(':id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(DepartmentSchema)) body: z.infer<typeof DepartmentSchema>,
  ) {
    return this.departments.update(id, body);
  }

  @RequirePermission('admin.departments.manage')
  @Put(':id/archived')
  @HttpCode(204)
  archive(@Param('id') id: string, @Body(new ZodPipe(ArchiveSchema)) body: { archived: boolean }) {
    return this.departments.setArchived(id, body.archived);
  }

  @RequirePermission('admin.departments.manage')
  @Post(':id/leaders')
  @HttpCode(201)
  nameLeader(
    @Param('id') id: string,
    @Body(new ZodPipe(LeaderSchema)) body: z.infer<typeof LeaderSchema>,
  ) {
    return this.departments.nameLeader(id, body);
  }

  @RequirePermission('admin.departments.manage')
  @Post(':id/leaders/:leaderId/end')
  @HttpCode(204)
  endLeader(@Param('id') id: string, @Param('leaderId') leaderId: string) {
    return this.departments.endLeader(id, leaderId);
  }
}

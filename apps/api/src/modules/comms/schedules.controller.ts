import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequireAnyPermission } from '../../core/rbac/decorators.js';
import { SchedulesService } from './schedules.service.js';

const ScheduleSchema = z.object({
  departmentId: z.uuid().nullable().default(null),
  name: z.string().trim().min(2, 'Name it').max(80),
  audience: z.object({
    key: z.string().max(60),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  templateIds: z.array(z.uuid()).min(1, 'Choose at least one template').max(5),
  fields: z.record(z.string(), z.string().max(60)).default({}),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1, 'Choose at least one day').max(7),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time such as 18:00'),
  jitterMinutes: z.number().int().min(0).max(120).default(0),
  startsOn: z.iso.date(),
  endsOn: z.iso.date().nullable().default(null),
});
const ActiveSchema = z.object({ active: z.boolean() });

/** Recurring messages. Who may touch which is the service's to check. */
@Controller('comms/schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @RequireAnyPermission('comms.schedules.read', 'comms.department.read')
  @Get()
  list(@Query('departmentId') departmentId?: string) {
    const scope =
      departmentId === undefined || departmentId === ''
        ? undefined
        : departmentId === 'none'
          ? null
          : departmentId;
    return this.schedules.list(scope);
  }

  @RequireAnyPermission('comms.schedules.manage', 'comms.department.send')
  @Post()
  @HttpCode(201)
  create(@Body(new ZodPipe(ScheduleSchema)) body: z.infer<typeof ScheduleSchema>) {
    return this.schedules.create(body);
  }

  @RequireAnyPermission('comms.schedules.manage', 'comms.department.send')
  @Put(':id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(ScheduleSchema)) body: z.infer<typeof ScheduleSchema>,
  ) {
    return this.schedules.update(id, body);
  }

  @RequireAnyPermission('comms.schedules.manage', 'comms.department.send')
  @Put(':id/active')
  @HttpCode(204)
  setActive(@Param('id') id: string, @Body(new ZodPipe(ActiveSchema)) body: { active: boolean }) {
    return this.schedules.setActive(id, body.active);
  }

  @RequireAnyPermission('comms.schedules.manage', 'comms.department.send')
  @Post(':id/archive')
  @HttpCode(204)
  archive(@Param('id') id: string) {
    return this.schedules.archive(id);
  }
}

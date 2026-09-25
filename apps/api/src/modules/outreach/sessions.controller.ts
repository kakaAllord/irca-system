import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { SessionsService } from './sessions.service.js';

const Day = z.iso.date('A date such as 2026-09-26');
const SessionSchema = z.object({
  heldOn: Day,
  title: z.string().trim().max(80).default(''),
  notes: z.string().trim().max(2000).optional(),
});
const StatusSchema = z.object({ status: z.enum(['PLANNED', 'COMPLETED', 'CANCELLED']) });
const TeamSchema = z.object({
  groupId: z.uuid().nullish(),
  area: z.string().trim().min(2, 'Where they are going').max(80),
  personIds: z.array(z.uuid()).max(100),
  notes: z.string().trim().max(1000).optional(),
});
const SpokenSchema = z.object({ spokenToOnly: z.number().int().min(0).max(10_000) });

const STATUSES = ['PLANNED', 'COMPLETED', 'CANCELLED'] as const;

/** Saturdays: planning one, sending teams to areas, and closing it. */
@Controller('outreach')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @RequirePermission('outreach.sessions.read')
  @Get('sessions')
  list(@Query() query: Record<string, string | undefined>) {
    const day = (s?: string) => (s && Day.safeParse(s).success ? s : undefined);
    return this.sessions.list({
      status: STATUSES.find((s) => s === query.status),
      from: day(query.from),
      to: day(query.to),
    });
  }

  @RequirePermission('outreach.sessions.read')
  @Get('areas')
  areas(@Query('q') q?: string) {
    return this.sessions.areas(q);
  }

  @RequirePermission('outreach.sessions.read')
  @Get('sessions/:id')
  get(@Param('id') id: string) {
    return this.sessions.get(id);
  }

  @RequirePermission('outreach.sessions.manage')
  @Post('sessions')
  @HttpCode(201)
  create(@Body(new ZodPipe(SessionSchema)) body: z.infer<typeof SessionSchema>) {
    return this.sessions.create(body);
  }

  @RequirePermission('outreach.sessions.manage')
  @Put('sessions/:id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(SessionSchema)) body: z.infer<typeof SessionSchema>,
  ) {
    return this.sessions.update(id, body);
  }

  @RequirePermission('outreach.sessions.manage')
  @Put('sessions/:id/status')
  @HttpCode(204)
  status(
    @Param('id') id: string,
    @Body(new ZodPipe(StatusSchema)) body: z.infer<typeof StatusSchema>,
  ) {
    return this.sessions.setStatus(id, body.status);
  }

  @RequirePermission('outreach.sessions.manage')
  @Post('sessions/:id/teams')
  @HttpCode(201)
  addTeam(
    @Param('id') id: string,
    @Body(new ZodPipe(TeamSchema)) body: z.infer<typeof TeamSchema>,
  ) {
    return this.sessions.addTeam(id, body);
  }

  @RequirePermission('outreach.sessions.manage')
  @Put('sessions/:id/teams/:teamId')
  @HttpCode(204)
  updateTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body(new ZodPipe(TeamSchema)) body: z.infer<typeof TeamSchema>,
  ) {
    return this.sessions.updateTeam(id, teamId, body);
  }

  @RequirePermission('outreach.sessions.manage')
  @Delete('sessions/:id/teams/:teamId')
  @HttpCode(204)
  removeTeam(@Param('id') id: string, @Param('teamId') teamId: string) {
    return this.sessions.removeTeam(id, teamId);
  }

  /** The team's own count of people spoken to without taking details. */
  @RequirePermission('outreach.reached.record')
  @Put('teams/:teamId/spoken-to')
  @HttpCode(204)
  spokenTo(
    @Param('teamId') teamId: string,
    @Body(new ZodPipe(SpokenSchema)) body: z.infer<typeof SpokenSchema>,
  ) {
    return this.sessions.setSpokenToOnly(teamId, body.spokenToOnly);
  }
}

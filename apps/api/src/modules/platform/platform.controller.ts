import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ChurchesService, type NewChurch } from './churches.service.js';
import { PlatformUsageService } from './usage.service.js';
import { HealthService } from './health.service.js';
import { ImpersonationLogService } from './impersonations.service.js';
import { PlatformLogsService } from './logs.service.js';

const NewChurchSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9]{1,9}$/, '2 to 10 letters or digits, starting with a letter'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'Lowercase letters, digits and dashes'),
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(3).max(64).default('Africa/Dar_es_Salaam'),
  currency: z.string().trim().length(3).default('TZS'),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.email(),
});
const ReasonSchema = z.object({
  reason: z.string().trim().min(3, 'Say why, for the log').max(300),
});
const KeySchema = z.object({ name: z.string().trim().min(2).max(80) });

const ServerLogSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  search: z.string().trim().max(120).optional(),
  since: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(1_000).default(200),
});

const ActionLogSchema = z.object({
  actorUserId: z.uuid().optional(),
  action: z.string().trim().max(80).optional(),
  search: z.string().trim().max(120).optional(),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const list = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

/**
 * The dev console's API. Every route needs a platform permission, which only
 * a dev has, and none of them needs a church: a dev works across all of them.
 */
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly churches: ChurchesService,
    private readonly usage: PlatformUsageService,
    private readonly health: HealthService,
    private readonly log: ImpersonationLogService,
    private readonly logs: PlatformLogsService,
  ) {}

  @RequirePermission('platform.churches.read')
  @Get('churches')
  listChurches(@Query('days') days?: string) {
    return this.churches.list(Math.min(Math.max(Number(days) || 7, 1), 90));
  }

  @RequirePermission('platform.churches.manage')
  @Post('churches')
  createChurch(@Body(new ZodPipe(NewChurchSchema)) body: NewChurch) {
    return this.churches.create(body);
  }

  @RequirePermission('platform.churches.read')
  @Get('churches/:id')
  church(@Param('id') id: string) {
    return this.churches.get(id);
  }

  @RequirePermission('platform.usage.read')
  @Get('churches/:id/usage')
  churchUsage(
    @Param('id') id: string,
    @Query('metrics') metrics?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usage.church(id, list(metrics), from ?? daysAgo(89), to ?? today());
  }

  @RequirePermission('platform.usage.read')
  @Get('churches/:id/database')
  database(@Param('id') id: string) {
    return this.usage.database(id);
  }

  @RequirePermission('platform.churches.read')
  @Get('churches/:id/users')
  users(@Param('id') id: string) {
    return this.churches.users(id);
  }

  @RequirePermission('platform.churches.read')
  @Get('churches/:id/audit')
  activity(@Param('id') id: string, @Query('before') before?: string) {
    return this.churches.activity(id, before);
  }

  @RequirePermission('platform.churches.manage')
  @Post('churches/:id/suspend')
  @HttpCode(204)
  suspend(@Param('id') id: string, @Body(new ZodPipe(ReasonSchema)) body: { reason: string }) {
    return this.churches.setStatus(id, 'SUSPENDED', body.reason);
  }

  @RequirePermission('platform.churches.manage')
  @Post('churches/:id/reactivate')
  @HttpCode(204)
  reactivate(@Param('id') id: string, @Body(new ZodPipe(ReasonSchema)) body: { reason: string }) {
    return this.churches.setStatus(id, 'ACTIVE', body.reason);
  }

  @RequirePermission('platform.churches.manage')
  @Get('churches/:id/api-clients')
  apiClients(@Param('id') id: string) {
    return this.churches.apiClients(id);
  }

  @RequirePermission('platform.churches.manage')
  @Post('churches/:id/api-clients')
  createApiClient(@Param('id') id: string, @Body(new ZodPipe(KeySchema)) body: { name: string }) {
    return this.churches.createApiClient(id, body.name);
  }

  @RequirePermission('platform.churches.manage')
  @Delete('churches/:id/api-clients/:clientId')
  @HttpCode(204)
  revokeApiClient(@Param('id') id: string, @Param('clientId') clientId: string) {
    return this.churches.revokeApiClient(id, clientId);
  }

  @RequirePermission('platform.health.read')
  @Get('health')
  platformHealth() {
    return this.health.report();
  }

  @RequirePermission('platform.usage.read')
  @Get('usage')
  platformUsage(
    @Query('metrics') metrics?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usage.platform(list(metrics), from ?? daysAgo(89), to ?? today());
  }

  /** What the server wrote, newest first. Held in memory, so empty after a restart. */
  @RequirePermission('platform.logs.read')
  @Get('logs/server')
  serverLogs(@Query(new ZodPipe(ServerLogSchema)) query: z.infer<typeof ServerLogSchema>) {
    return this.logs.server(query);
  }

  /** What people did. A dev sees every church; anyone else sees their own. */
  @RequirePermission('platform.logs.read')
  @Get('logs/actions')
  actionLogs(@Query(new ZodPipe(ActionLogSchema)) query: z.infer<typeof ActionLogSchema>) {
    return this.logs.actions(query);
  }

  @RequirePermission('platform.impersonations.read')
  @Get('impersonations')
  impersonations(@Query() query: Record<string, string | undefined>) {
    return this.log.sessions({
      church: query.church,
      actor: query.actor,
      subject: query.subject,
      since: query.since,
      until: query.until,
      before: query.before,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @RequirePermission('platform.impersonations.read')
  @Get('impersonations/events')
  events(@Query('after') after: string, @Query('church') church?: string) {
    return this.log.events(after, church);
  }

  @RequirePermission('platform.impersonations.read')
  @Get('impersonations/churches')
  logChurches() {
    return this.log.churches();
  }

  @RequirePermission('platform.impersonations.read')
  @Get('impersonations/:id')
  impersonation(@Param('id') id: string) {
    return this.log.session(id);
  }
}

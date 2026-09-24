import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { DevUsageService } from './usage.service.js';
import { HealthService } from './health.service.js';
import { ImpersonationLogService } from './impersonations.service.js';
import { DevLogsService } from './logs.service.js';

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
 * The developer's own portal: how the system is doing, what it is being used
 * for, what it wrote, and who viewed the portal as whom.
 *
 * It used to be the console above every church. There is one church now, so
 * these are ordinary permissions granted by an ordinary role.
 */
@Controller('dev')
export class DevController {
  constructor(
    private readonly usage: DevUsageService,
    private readonly health: HealthService,
    private readonly impersonationLog: ImpersonationLogService,
    private readonly logs: DevLogsService,
  ) {}

  @RequirePermission('dev.health.read')
  @Get('health')
  systemHealth() {
    return this.health.report();
  }

  @RequirePermission('dev.usage.read')
  @Get('usage')
  usageOverTime(
    @Query('metrics') metrics?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usage.series(list(metrics), from ?? daysAgo(89), to ?? today());
  }

  @RequirePermission('dev.usage.read')
  @Get('database')
  database() {
    return this.usage.database();
  }

  /** What the server wrote, newest first. Held in memory, so empty after a restart. */
  @RequirePermission('dev.logs.read')
  @Get('logs/server')
  serverLogs(@Query(new ZodPipe(ServerLogSchema)) query: z.infer<typeof ServerLogSchema>) {
    return this.logs.server(query);
  }

  /** What people did, from the same rows the Activity page reads. */
  @RequirePermission('dev.logs.read')
  @Get('logs/actions')
  actionLogs(@Query(new ZodPipe(ActionLogSchema)) query: z.infer<typeof ActionLogSchema>) {
    return this.logs.actions(query);
  }

  @RequirePermission('dev.impersonations.read')
  @Get('impersonations')
  impersonations(@Query() query: Record<string, string | undefined>) {
    return this.impersonationLog.sessions({
      actor: query.actor,
      subject: query.subject,
      since: query.since,
      until: query.until,
      before: query.before,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @RequirePermission('dev.impersonations.read')
  @Get('impersonations/events')
  events(@Query('after') after: string) {
    return this.impersonationLog.events(after);
  }
}

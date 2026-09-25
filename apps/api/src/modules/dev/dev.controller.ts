import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { DevUsageService } from './usage.service.js';
import { HealthService } from './health.service.js';
import { ImpersonationLogService } from './impersonations.service.js';
import { DevLogsService } from './logs.service.js';
import { DevSettingsService } from './settings.service.js';

const AlertsSchema = z.object({
  /** The storage the database's plan allows; null stops watching it. */
  dbStorageGb: z.number().positive('More than 0').max(100_000, 'At most 100,000').nullable(),
});

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

const ChurchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,10}$/, 'The code is 2 to 10 letters, like IRCA.'),
    timezone: z
      .string()
      .trim()
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'That is not a timezone. Use a name like Africa/Dar_es_Salaam.'),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'The currency is a three-letter code, like TZS.'),
  })
  .partial();

const NewKeySchema = z.object({ name: z.string().trim().min(2).max(120) });

const DaysSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

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
    private readonly settings: DevSettingsService,
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

  /** The busiest routes and the slowest, over the last `days`. */
  @RequirePermission('dev.usage.read')
  @Get('usage/routes')
  routes(@Query(new ZodPipe(DaysSchema)) query: z.infer<typeof DaysSchema>) {
    return this.usage.routes(query.days);
  }

  /** The last fifty emails, addresses masked. */
  @RequirePermission('dev.usage.read')
  @Get('usage/emails')
  emails() {
    return this.usage.emails();
  }

  @RequirePermission('dev.church.manage')
  @Get('church')
  church() {
    return this.settings.church();
  }

  @RequirePermission('dev.church.manage')
  @Patch('church')
  updateChurch(@Body(new ZodPipe(ChurchSchema)) body: z.infer<typeof ChurchSchema>) {
    return this.settings.updateChurch(body);
  }

  /** The registration form's keys: which exist, when each was last used. */
  @RequirePermission('dev.church.manage')
  @Get('api-clients')
  keys() {
    return this.settings.keys();
  }

  @RequirePermission('dev.church.manage')
  @Post('api-clients')
  createKey(@Body(new ZodPipe(NewKeySchema)) body: z.infer<typeof NewKeySchema>) {
    return this.settings.createKey(body.name);
  }

  @RequirePermission('dev.church.manage')
  @Delete('api-clients/:id')
  @HttpCode(204)
  async revokeKey(@Param('id') id: string) {
    await this.settings.revokeKey(id);
  }

  /** Who hears when something is wrong, and what is wrong now (docs/plan/10, step 10.4). */
  @RequirePermission('dev.church.manage')
  @Get('alerts')
  alerts() {
    return this.settings.alertsPage();
  }

  @RequirePermission('dev.church.manage')
  @Put('alerts')
  saveAlerts(@Body(new ZodPipe(AlertsSchema)) body: z.infer<typeof AlertsSchema>) {
    return this.settings.saveAlerts(body.dbStorageGb);
  }

  @RequirePermission('dev.church.manage')
  @Post('alerts/test')
  @HttpCode(200)
  testAlert() {
    return this.settings.testAlert();
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

  /** One session and every page opened in it, for `show <id>` in the terminal. */
  @RequirePermission('dev.impersonations.read')
  @Get('impersonations/:idOrPrefix')
  session(@Param('idOrPrefix') idOrPrefix: string) {
    return this.impersonationLog.session(idOrPrefix);
  }
}

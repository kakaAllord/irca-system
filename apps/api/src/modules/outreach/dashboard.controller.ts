import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { DashboardService, type Period } from './dashboard.service.js';

const Day = z.iso.date();
const period = (query: Record<string, string | undefined>): Partial<Period> => ({
  from: query.from && Day.safeParse(query.from).success ? query.from : undefined,
  to: query.to && Day.safeParse(query.to).success ? query.to : undefined,
});

/** The Outreach dashboard, and the list behind each of its numbers. */
@Controller('outreach/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermission('outreach.dashboard.read')
  @Get()
  get(@Query() query: Record<string, string | undefined>) {
    return this.dashboard.dashboard(period(query));
  }

  @RequirePermission('outreach.dashboard.read')
  @Get(':figure')
  list(@Param('figure') figure: string, @Query() query: Record<string, string | undefined>) {
    return this.dashboard.list(figure, period(query));
  }
}

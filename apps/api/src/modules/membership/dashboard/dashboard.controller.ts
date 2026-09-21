import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../../../core/rbac/decorators.js';
import { DashboardService } from './dashboard.service.js';

@Controller('membership')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermission('membership.dashboard.read')
  @Get('dashboard')
  get() {
    return this.dashboard.dashboard();
  }

  @RequirePermission('membership.insights.read')
  @Get('insights')
  insights(@Query('period') period?: string) {
    return this.dashboard.insights(period === '90d' || period === 'year' ? period : 'all');
  }
}

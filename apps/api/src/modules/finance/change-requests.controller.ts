import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ChangeRequestService } from '../../core/change-requests/change-request.service.js';

/**
 * What finance staff can see of their own requests. Approving happens in
 * Admin, never here: the owner's rule is that changes go to the church admin.
 */
@Controller('finance/change-requests')
export class FinanceChangeRequestsController {
  constructor(private readonly changeRequests: ChangeRequestService) {}

  @RequirePermission('finance.transactions.read')
  @Get()
  list(@Query('status') status?: string, @Query('mine') mine?: string) {
    return this.changeRequests.list({
      moduleKey: 'finance',
      status: status as 'PENDING' | undefined,
      mine: mine === 'true',
    });
  }

  @RequirePermission('finance.transactions.request_change')
  @Post(':id/cancel')
  @HttpCode(204)
  cancel(@Param('id') id: string) {
    return this.changeRequests.cancel(id);
  }
}

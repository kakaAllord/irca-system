import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { ExpenseItemsController, IncomeSourcesController } from './catalog.controller.js';
import { TransactionService } from './transactions.service.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionChangeHandler } from './transaction-change.handler.js';
import { FinanceChangeRequestsController } from './change-requests.controller.js';
import { ReportsService } from './reports.service.js';
import { FinanceReportsController } from './overview.controller.js';
import { PledgesService } from './pledges.service.js';
import { PledgeCampaignsController, PledgesController } from './pledges.controller.js';

/**
 * Money in and money out.
 *
 * Nothing in core imports this: the change-request handler registers itself
 * when the module starts, which is how a department adds a kind of record an
 * administrator can be asked to change.
 */
@Module({
  controllers: [
    IncomeSourcesController,
    ExpenseItemsController,
    TransactionsController,
    FinanceChangeRequestsController,
    FinanceReportsController,
    PledgeCampaignsController,
    PledgesController,
  ],
  providers: [
    CatalogService,
    TransactionService,
    ReportsService,
    TransactionChangeHandler,
    PledgesService,
  ],
})
export class FinanceModule {}

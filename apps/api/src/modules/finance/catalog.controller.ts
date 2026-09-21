import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateCatalogItemSchema,
  UpdateCatalogItemSchema,
  type CreateCatalogItemInput,
} from '@irca/shared';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { CatalogService, type CatalogKind } from './catalog.service.js';

/**
 * The two lists are the same thing twice, so one base class serves both and
 * the URLs stay obvious: /finance/income-sources and /finance/expense-items.
 */
abstract class CatalogController {
  protected abstract readonly kind: CatalogKind;

  constructor(protected readonly catalog: CatalogService) {}

  @RequirePermission('finance.catalog.read')
  @Get('suggest')
  suggest(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.catalog.suggest(this.kind, q ?? '', limit ? Number(limit) : undefined);
  }

  @RequirePermission('finance.catalog.read')
  @Get()
  list(
    @Query('q') q?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('page') page?: string,
  ) {
    return this.catalog.list(this.kind, { q, status, page: page ? Number(page) : 1 });
  }

  @RequirePermission('finance.catalog.create')
  @Post()
  create(@Body(new ZodPipe(CreateCatalogItemSchema)) body: CreateCatalogItemInput) {
    return this.catalog.create(this.kind, body);
  }

  @RequirePermission('finance.catalog.manage')
  @Patch(':id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateCatalogItemSchema))
    body: { name?: string; description?: string; confirmDistinct?: boolean },
  ) {
    return this.catalog.update(this.kind, id, body);
  }

  @RequirePermission('finance.catalog.manage')
  @Post(':id/deactivate')
  @HttpCode(204)
  deactivate(@Param('id') id: string) {
    return this.catalog.setActive(this.kind, id, false);
  }

  @RequirePermission('finance.catalog.manage')
  @Post(':id/activate')
  @HttpCode(204)
  activate(@Param('id') id: string) {
    return this.catalog.setActive(this.kind, id, true);
  }
}

// Each child names its own constructor, so Nest sees what to inject rather
// than relying on metadata emitted for the base class.
@Controller('finance/income-sources')
export class IncomeSourcesController extends CatalogController {
  protected readonly kind = 'income' as const;

  constructor(catalog: CatalogService) {
    super(catalog);
  }
}

@Controller('finance/expense-items')
export class ExpenseItemsController extends CatalogController {
  protected readonly kind = 'expense' as const;

  constructor(catalog: CatalogService) {
    super(catalog);
  }
}

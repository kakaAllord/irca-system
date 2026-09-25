import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CancelPledgeSchema,
  CreateCampaignSchema,
  CreatePledgeSchema,
  PLEDGE_FILTERS,
  RecordPaymentSchema,
  UpdateCampaignSchema,
  type CreateCampaignInput,
  type CreatePledgeInput,
  type PledgeFilter,
  type RecordPaymentInput,
  type UpdateCampaignInput,
} from '@irca/shared';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequireAnyPermission, RequirePermission } from '../../core/rbac/decorators.js';
import { PledgesService } from './pledges.service.js';

/**
 * Campaigns and their progress: totals and counts, which anyone in Pledges
 * may read. Who owes what is behind `finance.pledges.read_sensitive`.
 */
@Controller('finance/pledge-campaigns')
export class PledgeCampaignsController {
  constructor(private readonly pledges: PledgesService) {}

  @RequirePermission('finance.pledges.read')
  @Get()
  list() {
    return this.pledges.campaigns();
  }

  @RequirePermission('finance.pledges.manage')
  @Post()
  create(@Body(new ZodPipe(CreateCampaignSchema)) body: CreateCampaignInput) {
    return this.pledges.createCampaign(body);
  }

  @RequirePermission('finance.pledges.read')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.pledges.campaign(id);
  }

  @RequirePermission('finance.pledges.manage')
  @Patch(':id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateCampaignSchema)) body: UpdateCampaignInput,
  ) {
    return this.pledges.updateCampaign(id, body);
  }

  @RequirePermission('finance.pledges.read_sensitive')
  @Get(':id/pledges')
  pledgesOf(@Param('id') id: string, @Query('filter') filter?: string, @Query('q') q?: string) {
    const chosen = (PLEDGE_FILTERS as readonly string[]).includes(filter ?? '')
      ? (filter as PledgeFilter)
      : 'open';
    return this.pledges.pledgesOf(id, chosen, q ?? '');
  }
}

/**
 * One person's promise, and the money against it. There is no PUT and no
 * DELETE: a pledge is cancelled, a payment is corrected by request.
 */
@Controller('finance/pledges')
export class PledgesController {
  constructor(private readonly pledges: PledgesService) {}

  @RequirePermission('finance.pledges.manage')
  @Post()
  async create(
    @Body(new ZodPipe(CreatePledgeSchema)) body: CreatePledgeInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { id, created } = await this.pledges.createPledge(body);
    // A retried submit is not a second pledge, and says so with 200 rather than 201.
    res.status(created ? 201 : 200);
    return { id };
  }

  @RequirePermission('finance.pledges.manage')
  @Get('person-candidates')
  personCandidates(@Query('q') q?: string) {
    return this.pledges.personCandidates(q ?? '');
  }

  /** The clerk finds the person paying, not the list of everyone who owes. */
  @RequirePermission('finance.pledges.record_payment')
  @Get('lookup')
  lookup(@Query('q') q?: string) {
    return this.pledges.lookup(q ?? '');
  }

  @RequirePermission('finance.pledges.read_sensitive')
  @Get('people/:personId')
  forPerson(@Param('personId') personId: string) {
    return this.pledges.forPerson(personId);
  }

  @RequireAnyPermission('finance.pledges.read_sensitive', 'finance.pledges.record_payment')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.pledges.detail(id);
  }

  @RequirePermission('finance.pledges.manage')
  @Post(':id/cancel')
  @HttpCode(204)
  cancel(@Param('id') id: string, @Body(new ZodPipe(CancelPledgeSchema)) body: { reason: string }) {
    return this.pledges.cancel(id, body.reason);
  }

  @RequirePermission('finance.pledges.record_payment')
  @Post(':id/payments')
  async pay(
    @Param('id') id: string,
    @Body(new ZodPipe(RecordPaymentSchema)) body: RecordPaymentInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.pledges.recordPayment(id, body);
    res.status(result.created ? 201 : 200);
    return result;
  }
}

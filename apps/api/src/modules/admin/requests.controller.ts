import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { DecideRequestSchema, RejectRequestSchema } from '@irca/shared';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ChangeRequestService } from '../../core/change-requests/change-request.service.js';

/**
 * The administrators' inbox: everything any portal has asked them to
 * approve. One place for every department, because the rule is the same
 * everywhere — changes to protected records go to the church admin (D17).
 */
@Controller('admin/requests')
export class RequestsController {
  constructor(private readonly changeRequests: ChangeRequestService) {}

  @RequirePermission('admin.requests.read')
  @Get()
  list(@Query('status') status?: string, @Query('module') moduleKey?: string) {
    return this.changeRequests.list({
      status: status as 'PENDING' | undefined,
      moduleKey,
    });
  }

  @RequirePermission('admin.requests.read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.changeRequests.get(id);
  }

  @RequirePermission('admin.requests.decide')
  @Post(':id/approve')
  // A decision is not a creation: 200, with what applying produced.
  @HttpCode(200)
  approve(
    @Param('id') id: string,
    @Body(new ZodPipe(DecideRequestSchema)) body: { note?: string },
  ) {
    return this.changeRequests.approve(id, body.note);
  }

  @RequirePermission('admin.requests.decide')
  @Post(':id/reject')
  @HttpCode(204)
  async reject(
    @Param('id') id: string,
    @Body(new ZodPipe(RejectRequestSchema)) body: { note: string },
  ) {
    await this.changeRequests.reject(id, body.note);
  }
}

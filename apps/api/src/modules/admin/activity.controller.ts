import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ActivityService } from './activity.service.js';

const QuerySchema = z.object({
  actorUserId: z.uuid().optional(),
  action: z.string().max(80).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@Controller('admin/audit')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @RequirePermission('admin.audit.read')
  @Get()
  list(@Query(new ZodPipe(QuerySchema)) query: z.infer<typeof QuerySchema>) {
    return this.activity.list(query);
  }
}

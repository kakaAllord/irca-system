import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { SMS_LANGS } from '@irca/shared';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ReachedService } from './reached.service.js';

const Day = z.iso.date('A date such as 2026-09-26');

/**
 * Four fields on the day: the name, the phone, where, and who reached them.
 * A team fills in where and who, so on a Saturday three are typed.
 */
const RecordSchema = z.object({
  sessionId: z.uuid().nullish(),
  teamId: z.uuid().nullish(),
  fullName: z.string().trim().min(2, 'Their name').max(120),
  dial: z
    .string()
    .trim()
    .regex(/^\+\d{1,4}$/, 'A dialling code such as +255')
    .default('+255'),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^\+?[\d\s-]*$/, 'Digits only')
    .default(''),
  area: z.string().trim().max(80).optional(),
  reachedByIds: z.array(z.uuid()).max(100).optional(),
  lang: z.enum(SMS_LANGS).optional(),
  mayMessage: z.boolean(),
  needsFollowUp: z.boolean().optional(),
  saved: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
  reachedOn: Day.optional(),
  samePersonId: z.uuid().optional(),
  notSamePerson: z.boolean().optional(),
});
const UpdateSchema = z
  .object({
    area: z.string().trim().max(80).optional(),
    note: z.string().trim().max(1000).optional(),
    needsFollowUp: z.boolean().optional(),
    saved: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

/** The people reached, and recording them. */
@Controller('outreach/reached')
export class ReachedController {
  constructor(private readonly reached: ReachedService) {}

  @RequirePermission('outreach.reached.read')
  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    const day = (s?: string) => (s && Day.safeParse(s).success ? s : undefined);
    const uuid = (s?: string) => (s && z.uuid().safeParse(s).success ? s : undefined);
    return this.reached.list({
      sessionId: uuid(query.session),
      q: query.q,
      thin: query.thin === '1',
      from: day(query.from),
      to: day(query.to),
      page: query.page ? Number(query.page) || 1 : 1,
    });
  }

  @RequirePermission('outreach.reached.record')
  @Post()
  @HttpCode(201)
  record(@Body(new ZodPipe(RecordSchema)) body: z.infer<typeof RecordSchema>) {
    return this.reached.record(body);
  }

  @RequirePermission('outreach.reached.record')
  @Patch(':id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
  ) {
    return this.reached.update(id, body);
  }
}

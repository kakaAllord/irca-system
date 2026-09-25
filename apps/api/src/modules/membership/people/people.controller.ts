import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../../../core/http/zod.pipe.js';
import { RequirePermission } from '../../../core/rbac/decorators.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { csv } from '../../finance/csv.js';
import { STAGES } from '../journey.js';
import { PeopleService, TABS, type PeopleQuery, type Tab } from './people.service.js';

const AddSchema = z.object({
  fullName: z.string().trim().min(2, 'Their name').max(120),
  gender: z.enum(['Male', 'Female', '']).optional(),
  ageGroup: z.string().max(20).optional(),
  dial: z.string().max(6).optional(),
  phone: z.string().max(20).optional(),
  email: z.union([z.email(), z.literal('')]).optional(),
});
const FlagSchema = z.object({ value: z.boolean().nullable() });
const MoveSchema = z.object({
  to: z.enum(STAGES as [string, ...string[]]),
  note: z.string().trim().max(300).optional(),
});
const NoteSchema = z.object({
  kind: z.enum(['NOTE', 'VISIT', 'CALL']).default('NOTE'),
  body: z.string().trim().min(2, 'Write something').max(2000),
});
const ReminderSchema = z.object({ channel: z.enum(['COPY_LINK', 'WHATSAPP']) });

/**
 * The Members screen, and each person's record.
 *
 * What people wrote in confidence is decided in one place, the DTO, from one
 * permission. These routes only ask for the permission their action needs.
 */
const MessagingSchema = z.object({
  lang: z.enum(['en', 'sw', 'fr']),
  optOut: z.boolean(),
});

@Controller('membership/people')
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('membership.people.read')
  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    return this.people.list(parse(query));
  }

  @RequirePermission('membership.people.export')
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Query() query: Record<string, string | undefined>, @Res() res: Response) {
    const { rows } = await this.people.all(parse(query));
    await this.audit.recordNow({
      action: 'membership.people.exported',
      summary: `Downloaded ${rows.length} people as CSV`,
      meta: { ...query },
    });
    const body = csv(
      [
        'Name',
        'Phone',
        'Registered',
        'Gender',
        'Age group',
        'Lives in',
        'Interested in',
        'Heard via',
        'Stage',
        'Saved',
        'Baptised',
        'Finished the form',
      ],
      rows.map((p) => [
        p.fullName,
        p.phone,
        p.registeredAt.slice(0, 10),
        p.gender,
        p.ageGroup,
        p.livesIn,
        p.interestedIn.join('; '),
        p.heardVia.join('; '),
        p.stage,
        p.saved.value ? 'Yes' : 'No',
        p.baptised.value ? 'Yes' : 'No',
        p.complete ? 'Yes' : 'No',
      ]),
    );
    res.setHeader('Content-Disposition', `attachment; filename="people.csv"`);
    res.send(body);
  }

  @RequirePermission('membership.people.read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.people.get(id);
  }

  @RequirePermission('membership.people.update')
  @Post()
  add(@Body(new ZodPipe(AddSchema)) body: z.infer<typeof AddSchema>) {
    return this.people.add(body);
  }

  @RequirePermission('membership.people.update')
  @Post(':id/saved')
  @HttpCode(204)
  saved(@Param('id') id: string, @Body(new ZodPipe(FlagSchema)) body: { value: boolean | null }) {
    return this.people.setFlag(id, 'saved', body.value);
  }

  @RequirePermission('membership.people.update')
  @Post(':id/baptised')
  @HttpCode(204)
  baptised(
    @Param('id') id: string,
    @Body(new ZodPipe(FlagSchema)) body: { value: boolean | null },
  ) {
    return this.people.setFlag(id, 'baptised', body.value);
  }

  @RequirePermission('membership.people.update')
  @Post(':id/stage')
  @HttpCode(204)
  move(@Param('id') id: string, @Body(new ZodPipe(MoveSchema)) body: z.infer<typeof MoveSchema>) {
    return this.people.move(id, body.to as never, body.note);
  }

  /** The language they are written to in, and "no messages", set by the office. */
  @RequirePermission('membership.people.update')
  @Put(':id/messaging')
  @HttpCode(204)
  messaging(
    @Param('id') id: string,
    @Body(new ZodPipe(MessagingSchema)) body: z.infer<typeof MessagingSchema>,
  ) {
    return this.people.setMessaging(id, body);
  }

  @RequirePermission('membership.notes.write')
  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body(new ZodPipe(NoteSchema)) body: z.infer<typeof NoteSchema>,
  ) {
    return this.people.addNote(id, body.kind, body.body);
  }

  @RequirePermission('membership.registrations.remind')
  @Get(':id/registration-link')
  link(@Param('id') id: string) {
    return this.people.registrationLink(id);
  }

  @RequirePermission('membership.registrations.remind')
  @Post(':id/reminders')
  @HttpCode(204)
  remind(
    @Param('id') id: string,
    @Body(new ZodPipe(ReminderSchema)) body: { channel: 'COPY_LINK' | 'WHATSAPP' },
  ) {
    return this.people.recordReminder(id, body.channel);
  }
}

function parse(query: Record<string, string | undefined>): PeopleQuery {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) =>
    allowed.includes(value as T) ? (value as T) : undefined;
  return {
    tab: pick(query.tab, TABS) as Tab | undefined,
    q: query.q,
    salvation: pick(query.salvation, ['saved', 'not'] as const),
    baptism: pick(query.baptism, ['baptised', 'not'] as const),
    gender: query.gender && query.gender !== 'any' ? query.gender : undefined,
    age: query.age && query.age !== 'any' ? query.age : undefined,
    lives: pick(query.lives, ['arusha', 'region', 'country'] as const),
    source: query.source && query.source !== 'any' ? query.source : undefined,
    page: query.page ? Number(query.page) : 1,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}

import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Values } from '@irca/shared/registration';
import { ZodPipe } from '../../../core/http/zod.pipe.js';
import { PublicClient } from '../../../core/rbac/decorators.js';
import { PublicRegistrationService } from './registration.service.js';

const LangSchema = z.object({ lang: z.string().max(5).optional() });
/**
 * Answers are checked by the flow's own rules, in the visitor's language, not
 * by a schema here: there is one set of rules and the form and the API share
 * it. This only keeps the shape sane.
 */
const DraftSchema = z.object({ draft: z.record(z.string(), z.unknown()).default({}) });
const ValuesSchema = z.object({ values: z.record(z.string(), z.unknown()).default({}) });

/**
 * What a church's registration form calls.
 *
 * No session, no person: the key says which church, and the token in the URL
 * says which registration. The limits are per visitor address, because a
 * Sunday morning is a few hundred taps from a few dozen phones, and anything
 * beyond that is not a congregation.
 */
@Controller('public/registrations')
export class PublicRegistrationController {
  constructor(private readonly registrations: PublicRegistrationService) {}

  @PublicClient('REGISTRATION')
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post()
  create(@Body(new ZodPipe(LangSchema)) body: { lang?: string }) {
    return this.registrations.create(body.lang ?? 'en');
  }

  @PublicClient('REGISTRATION')
  @Get(':token')
  get(@Param('token') token: string) {
    return this.registrations.byToken(token);
  }

  @PublicClient('REGISTRATION')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post(':token/steps/:stepId')
  @HttpCode(200)
  save(
    @Param('token') token: string,
    @Param('stepId') stepId: string,
    @Body(new ZodPipe(DraftSchema)) body: { draft: Record<string, unknown> },
  ) {
    return this.registrations.saveStep(token, stepId, body.draft as Partial<Values>);
  }

  @PublicClient('REGISTRATION')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Post(':token/draft')
  @HttpCode(204)
  async draft(
    @Param('token') token: string,
    @Body(new ZodPipe(ValuesSchema.extend({ stepId: z.string().max(40) })))
    body: { stepId: string; values: Record<string, unknown> },
  ) {
    await this.registrations.saveDraft(token, body.stepId, body.values as Partial<Values>);
  }

  @PublicClient('REGISTRATION')
  @Put(':token/lang')
  @HttpCode(204)
  async lang(
    @Param('token') token: string,
    @Body(new ZodPipe(LangSchema)) body: { lang?: string },
  ) {
    await this.registrations.setLanguage(token, body.lang ?? '');
  }

  @PublicClient('REGISTRATION')
  @Post(':token/submit')
  @HttpCode(200)
  submit(@Param('token') token: string) {
    return this.registrations.submit(token);
  }
}

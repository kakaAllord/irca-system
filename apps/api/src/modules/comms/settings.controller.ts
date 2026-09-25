import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { SMS_LANGS } from '@irca/shared';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { SettingsService } from './settings.service.js';
import { QUIET } from './settings.js';

const money = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'A sum in TZS, such as 30 or 30.50');

const SettingsSchema = z.object({
  pricePerSegment: money,
  dailyCap: money.nullable(),
  defaultLang: z.enum(SMS_LANGS),
  quietHours: z.string().trim().regex(QUIET, 'Two times, such as 21:00-07:00'),
});

const BeemSchema = z.object({
  apiKey: z.string().trim().max(200).optional(),
  secretKey: z.string().trim().max(400).optional(),
  senderId: z.string().trim().min(1, 'The sender name Beem registered').max(11),
});

/** Comms → Settings: the price, the daily limit, quiet hours and the Beem account. */
@Controller('comms/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @RequirePermission('comms.settings.manage')
  @Get()
  get() {
    return this.settings.get();
  }

  @RequirePermission('comms.settings.manage')
  @Put()
  @HttpCode(204)
  save(@Body(new ZodPipe(SettingsSchema)) body: z.infer<typeof SettingsSchema>) {
    return this.settings.save(body);
  }

  @RequirePermission('comms.settings.manage')
  @Put('beem')
  @HttpCode(204)
  saveBeem(@Body(new ZodPipe(BeemSchema)) body: z.infer<typeof BeemSchema>) {
    return this.settings.saveBeem(body);
  }

  @RequirePermission('comms.settings.manage')
  @Post('beem/test')
  test() {
    return this.settings.testBeem();
  }
}

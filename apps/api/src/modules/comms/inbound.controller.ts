import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CalledByProvider, Public } from '../../core/auth/decorators.js';
import { InboundService, type BeemReply } from './inbound.service.js';

/**
 * What Beem calls us with. Beem signs nothing, so the URL given to it carries
 * a secret of ours (BEEM_INBOUND_SECRET); a call without it is refused and
 * nothing is written. See docs/deployment.md for the URL to give Beem.
 */
@Controller('public/comms')
export class InboundController {
  constructor(private readonly inbound: InboundService) {}

  @Public()
  @CalledByProvider()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('inbound')
  @HttpCode(200)
  reply(@Query('key') key: string | undefined, @Body() body: BeemReply) {
    this.inbound.checkSecret(key);
    return this.inbound.reply(body && typeof body === 'object' ? body : {});
  }
}

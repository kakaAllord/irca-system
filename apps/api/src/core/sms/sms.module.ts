import { Global, Module } from '@nestjs/common';
import { LogSmsProvider } from './providers/log.provider.js';
import { MemorySmsProvider } from './providers/memory.provider.js';
import { SmsGateway } from './sms.gateway.js';

/**
 * Text messages, as email is done: a provider chosen by circumstance rather
 * than by a code change. See SmsGateway for which, and when.
 */
@Global()
@Module({
  providers: [SmsGateway, LogSmsProvider, MemorySmsProvider],
  exports: [SmsGateway, MemorySmsProvider],
})
export class SmsModule {}

import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { EmailService } from './email.service.js';
import { EMAIL_PROVIDER } from './email.types.js';
import { LogEmailProvider } from './providers/log.provider.js';
import { MemoryEmailProvider } from './providers/memory.provider.js';
import { ResendEmailProvider } from './providers/resend.provider.js';

/**
 * Which provider is used is a setting, not a code change: nothing is sent in
 * development, tests keep messages in memory, production uses Resend.
 */
@Global()
@Module({
  providers: [
    EmailService,
    LogEmailProvider,
    MemoryEmailProvider,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [AppConfig, LogEmailProvider, MemoryEmailProvider, ResendEmailProvider],
      useFactory: (
        config: AppConfig,
        log: LogEmailProvider,
        memory: MemoryEmailProvider,
        resend: ResendEmailProvider,
      ) => {
        switch (config.get('EMAIL_PROVIDER')) {
          case 'resend':
            return resend;
          case 'memory':
            return memory;
          default:
            return log;
        }
      },
    },
  ],
  exports: [EmailService, EMAIL_PROVIDER, MemoryEmailProvider],
})
export class EmailModule {}

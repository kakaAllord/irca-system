import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module.js';
import { RequestContextModule } from './core/context/context.module.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter.js';
import { HealthController } from './core/health/health.controller.js';
import { AuthModule } from './core/auth/auth.module.js';
import { SessionGuard } from './core/auth/session.guard.js';
import { CsrfGuard } from './core/auth/csrf.guard.js';

@Module({
  // Order matters: the request context must exist before the logger asks it
  // for the request id.
  imports: [
    AppConfigModule,
    RequestContextModule,
    LoggingModule,
    DatabaseModule,
    // 300 requests a minute from one address by default; sign-in is tighter.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      errorMessage: 'Too many requests. Wait a minute and try again.',
    }),
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global guards run in this order: the cheapest refusals first (too many
    // requests, a write without the portal's header), then who is asking.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
  ],
})
export class AppModule {}

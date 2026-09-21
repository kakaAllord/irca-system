import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module.js';
import { RequestContextModule } from './core/context/context.module.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { CoreModule } from './core/core.module.js';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter.js';
import { NoStoreInterceptor } from './core/http/no-store.interceptor.js';
import { HealthController } from './core/health/health.controller.js';
import { AuthModule } from './core/auth/auth.module.js';
import { SessionGuard } from './core/auth/session.guard.js';
import { CsrfGuard } from './core/auth/csrf.guard.js';
import { ReadOnlyGuard } from './core/impersonation/read-only.guard.js';
import { ImpersonationModule } from './core/impersonation/impersonation.module.js';
import { PermissionsGuard } from './core/rbac/permissions.guard.js';
import { RateLimitGuard } from './core/limits/rate-limit.guard.js';
import { AuditInterceptor } from './core/audit/audit.interceptor.js';
import { UsageInterceptor } from './core/usage/usage.interceptor.js';

@Module({
  // Order matters: the request context must exist before the logger asks it
  // for the request id, and the database before anything that reads it.
  imports: [
    AppConfigModule,
    RequestContextModule,
    LoggingModule,
    DatabaseModule,
    // 300 requests a minute from one address; sign-in is tighter still.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      errorMessage: 'Too many requests. Wait a minute and try again.',
    }),
    CoreModule,
    AuthModule,
    ImpersonationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guards run in this order: the cheapest refusals first (too many requests
    // from one address, a write without the portal's header), then who is
    // asking, then whether this request may change anything at all, then
    // whether this person may do this particular thing.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useExisting: RateLimitGuard },
    { provide: APP_GUARD, useExisting: ReadOnlyGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useExisting: NoStoreInterceptor },
    { provide: APP_INTERCEPTOR, useExisting: UsageInterceptor },
    { provide: APP_INTERCEPTOR, useExisting: AuditInterceptor },
  ],
})
export class AppModule {}

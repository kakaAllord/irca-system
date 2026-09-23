import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { RequestAuth } from './context/request-auth.js';
import { PlacementService } from './database/placement.service.js';
import { PasswordService } from './auth/password.service.js';
import { SessionService } from './auth/session.service.js';
import { MeService } from './auth/me.service.js';
import { SessionGuard } from './auth/session.guard.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { PermissionResolver } from './rbac/permission-resolver.service.js';
import { PermissionsGuard } from './rbac/permissions.guard.js';
import { RegistrySync } from './rbac/registry-sync.service.js';
import { RouteAudit } from './rbac/route-audit.service.js';
import { ImpersonationService } from './impersonation/impersonation.service.js';
import { ReadOnlyGuard } from './impersonation/read-only.guard.js';
import { AuditService } from './audit/audit.service.js';
import { AuditInterceptor } from './audit/audit.interceptor.js';
import { UsageService } from './usage/usage.service.js';
import { UsageSnapshot } from './usage/usage-snapshot.service.js';
import { UsageInterceptor } from './usage/usage.interceptor.js';
import { NoStoreInterceptor } from './http/no-store.interceptor.js';
import { RateLimitGuard } from './limits/rate-limit.guard.js';
import { QuotaService } from './limits/quota.service.js';
import { InvitationService } from './invitations/invitation.service.js';
import { PasswordResetService } from './auth/password-reset.service.js';
import { JobRunner } from './jobs/job-runner.service.js';
import { ApiClientService } from './clients/api-client.service.js';
import { PublicClientGuard } from './clients/public-client.guard.js';
import { SequenceService } from './sequences/sequence.service.js';
import { LogBufferService, logBuffer } from './logging/log-buffer.service.js';
import { ChangeRequestRegistry } from './change-requests/registry.service.js';
import { ChangeRequestService } from './change-requests/change-request.service.js';
import { ScheduledJobs } from './jobs/scheduled-jobs.service.js';

/**
 * Everything that is true of every request, whatever module serves it: who is
 * asking, what they may do, what gets written down, what gets counted, and
 * what runs on a clock. Global, so no feature module has to import it, and so
 * nothing here can quietly depend on a feature.
 */
@Global()
@Module({
  imports: [DiscoveryModule, ScheduleModule.forRoot()],
  providers: [
    // The logger already writes into this one; the injector hands out the same
    // object rather than making a second, empty one.
    { provide: LogBufferService, useValue: logBuffer },
    RequestAuth,
    PlacementService,
    PasswordService,
    SessionService,
    MeService,
    PasswordResetService,
    InvitationService,
    PermissionResolver,
    ImpersonationService,
    AuditService,
    UsageService,
    UsageSnapshot,
    QuotaService,
    JobRunner,
    ScheduledJobs,
    RegistrySync,
    RouteAudit,
    SequenceService,
    ChangeRequestRegistry,
    ChangeRequestService,
    ApiClientService,
    SessionGuard,
    CsrfGuard,
    PublicClientGuard,
    ReadOnlyGuard,
    PermissionsGuard,
    RateLimitGuard,
    AuditInterceptor,
    UsageInterceptor,
    NoStoreInterceptor,
  ],
  exports: [
    LogBufferService,
    RequestAuth,
    PlacementService,
    PasswordService,
    SessionService,
    MeService,
    PasswordResetService,
    InvitationService,
    PermissionResolver,
    ImpersonationService,
    AuditService,
    UsageService,
    UsageSnapshot,
    QuotaService,
    JobRunner,
    RegistrySync,
    SequenceService,
    ChangeRequestRegistry,
    ChangeRequestService,
    ApiClientService,
    SessionGuard,
    CsrfGuard,
    PublicClientGuard,
    ReadOnlyGuard,
    PermissionsGuard,
    RateLimitGuard,
    AuditInterceptor,
    UsageInterceptor,
    NoStoreInterceptor,
  ],
})
export class CoreModule {}

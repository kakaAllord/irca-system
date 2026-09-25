import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { AppConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../core/database/database.module.js';
import { PasswordService } from '../core/auth/password.service.js';
import { RegistrySync } from '../core/rbac/registry-sync.service.js';
import { ApiClientService } from '../core/clients/api-client.service.js';
import { JobRunner } from '../core/jobs/job-runner.service.js';
import { UsageService } from '../core/usage/usage.service.js';
import { UsageSnapshot } from '../core/usage/usage-snapshot.service.js';
import { EmailModule } from '../core/email/email.module.js';
import { AuditService } from '../core/audit/audit.service.js';
import { SessionService } from '../core/auth/session.service.js';
import { PasswordResetService } from '../core/auth/password-reset.service.js';
import { PermissionResolver } from '../core/rbac/permission-resolver.service.js';

/**
 * What command-line tasks need: configuration, the database, and no HTTP
 * server. Email is here to queue, not to send: the outbox is drained by the
 * running API's own job, which this module deliberately does not include.
 *
 * Global, like the core module it stands in for, so the email module finds
 * the usage counter it counts sends with.
 */
@Global()
@Module({
  imports: [AppConfigModule, ClsModule.forRoot({ global: true }), DatabaseModule, EmailModule],
  providers: [
    PasswordService,
    RegistrySync,
    ApiClientService,
    JobRunner,
    UsageService,
    UsageSnapshot,
    AuditService,
    SessionService,
    PasswordResetService,
    PermissionResolver,
  ],
  exports: [UsageService],
})
export class CliModule {}

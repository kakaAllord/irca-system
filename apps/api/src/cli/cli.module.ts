import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { AppConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../core/database/database.module.js';
import { PasswordService } from '../core/auth/password.service.js';
import { RegistrySync } from '../core/rbac/registry-sync.service.js';
import { ApiClientService } from '../core/clients/api-client.service.js';
import { JobRunner } from '../core/jobs/job-runner.service.js';
import { UsageService } from '../core/usage/usage.service.js';
import { UsageSnapshot } from '../core/usage/usage-snapshot.service.js';

/** What command-line tasks need: configuration, the database, and no HTTP server. */
@Module({
  imports: [AppConfigModule, ClsModule.forRoot({ global: true }), DatabaseModule],
  providers: [
    PasswordService,
    RegistrySync,
    ApiClientService,
    JobRunner,
    UsageService,
    UsageSnapshot,
  ],
})
export class CliModule {}

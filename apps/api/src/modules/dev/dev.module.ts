import { Module } from '@nestjs/common';
import { DevController } from './dev.controller.js';
import { DevUsageService } from './usage.service.js';
import { HealthService } from './health.service.js';
import { ImpersonationLogService } from './impersonations.service.js';
import { DevLogsService } from './logs.service.js';
import { DevSettingsService } from './settings.service.js';

/**
 * How the system is doing, what it is used for, what it wrote, who viewed as
 * whom, and the church's own settings and keys.
 */
@Module({
  controllers: [DevController],
  providers: [
    DevUsageService,
    HealthService,
    ImpersonationLogService,
    DevLogsService,
    DevSettingsService,
  ],
})
export class DevModule {}

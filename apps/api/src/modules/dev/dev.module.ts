import { Module } from '@nestjs/common';
import { DevController } from './dev.controller.js';
import { DevUsageService } from './usage.service.js';
import { HealthService } from './health.service.js';
import { ImpersonationLogService } from './impersonations.service.js';
import { DevLogsService } from './logs.service.js';

/** How the system is doing, what it wrote, and who viewed as whom. */
@Module({
  controllers: [DevController],
  providers: [DevUsageService, HealthService, ImpersonationLogService, DevLogsService],
})
export class DevModule {}

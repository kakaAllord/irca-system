import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { ChurchesService } from './churches.service.js';
import { PlatformUsageService } from './usage.service.js';
import { HealthService } from './health.service.js';
import { ImpersonationLogService } from './impersonations.service.js';

/**
 * The dev console: every church, what it uses, the platform's health, and the
 * view-as log. The only feature module that reads across churches, which is
 * why it alone may use the core connection.
 */
@Module({
  controllers: [PlatformController],
  providers: [ChurchesService, PlatformUsageService, HealthService, ImpersonationLogService],
})
export class PlatformModule {}

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './config/config.module.js';
import { RequestContextModule } from './core/context/context.module.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter.js';
import { HealthController } from './core/health/health.controller.js';

@Module({
  // Order matters: the request context must exist before the logger asks it
  // for the request id.
  imports: [AppConfigModule, RequestContextModule, LoggingModule, DatabaseModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}

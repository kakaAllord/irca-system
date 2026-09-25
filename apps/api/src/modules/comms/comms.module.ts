import { Module } from '@nestjs/common';
import { DepartmentsModule } from '../departments/departments.module.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';
import { AudiencesController } from './audiences.controller.js';
import { AudiencesService } from './audiences.service.js';
import { StaffAudience } from './staff.audience.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';
import { OutboxService } from './outbox.service.js';
import { CommsJobs } from './comms.jobs.js';

/**
 * The Communication system (Phase 7): templates, audiences, sending, beats,
 * replies and cost. It asks Departments who leads what, and nothing else
 * about any department: audiences come in through the registry.
 */
@Module({
  imports: [DepartmentsModule],
  controllers: [SettingsController, AudiencesController, TemplatesController],
  providers: [
    SettingsService,
    AudiencesService,
    StaffAudience,
    TemplatesService,
    OutboxService,
    CommsJobs,
  ],
  exports: [AudiencesService, OutboxService],
})
export class CommsModule {}

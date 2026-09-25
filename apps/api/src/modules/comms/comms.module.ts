import { Module } from '@nestjs/common';
import { DepartmentsModule } from '../departments/departments.module.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/**
 * The Communication system (Phase 7): templates, audiences, sending, beats,
 * replies and cost. It asks Departments who leads what, and nothing else
 * about any department: audiences come in through the registry.
 */
@Module({
  imports: [DepartmentsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class CommsModule {}

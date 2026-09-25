import { Module } from '@nestjs/common';
import { DepartmentsModule } from '../departments/departments.module.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

/**
 * Outreach & Evangelism (Phase 8). Its team is its department (D28), so it
 * asks Departments who leads and who belongs.
 */
@Module({
  imports: [DepartmentsModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class OutreachModule {}

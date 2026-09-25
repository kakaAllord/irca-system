import { Module } from '@nestjs/common';
import { DepartmentsModule } from '../departments/departments.module.js';
import { ReachedController } from './reached.controller.js';
import { ReachedService } from './reached.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

/**
 * Outreach & Evangelism (Phase 8). Its team is its department (D28), so it
 * asks Departments who leads and who belongs.
 */
@Module({
  imports: [DepartmentsModule],
  controllers: [TeamController, SessionsController, ReachedController],
  providers: [TeamService, SessionsService, ReachedService],
})
export class OutreachModule {}

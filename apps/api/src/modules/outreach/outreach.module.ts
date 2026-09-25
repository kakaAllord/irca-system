import { Module } from '@nestjs/common';
import { DepartmentsModule } from '../departments/departments.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { FollowupController } from './followup.controller.js';
import { FollowupService } from './followup.service.js';
import { OutreachAudiences } from './outreach.audiences.js';
import { ReachedController } from './reached.controller.js';
import { ReachedService } from './reached.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';
import { TrainingController } from './training.controller.js';
import { TrainingService } from './training.service.js';

/**
 * Outreach & Evangelism (Phase 8). Its team is its department (D28), so it
 * asks Departments who leads and who belongs.
 */
@Module({
  imports: [DepartmentsModule],
  controllers: [
    DashboardController,
    TeamController,
    SessionsController,
    ReachedController,
    FollowupController,
    TrainingController,
  ],
  providers: [
    DashboardService,
    TeamService,
    SessionsService,
    ReachedService,
    FollowupService,
    TrainingService,
    OutreachAudiences,
  ],
})
export class OutreachModule {}

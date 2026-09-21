import { Module } from '@nestjs/common';
import { PeopleService } from './people.service.js';
import { PeopleController } from './people.controller.js';
import { RolesService } from './roles.service.js';
import { RolesController } from './roles.controller.js';
import { ChurchModulesService } from './church-modules.service.js';
import { ChurchModulesController } from './church-modules.controller.js';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';

/** The church's own administration: people, roles, portals and the activity log. */
@Module({
  controllers: [PeopleController, RolesController, ChurchModulesController, ActivityController],
  providers: [PeopleService, RolesService, ChurchModulesService, ActivityService],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { PublicRegistrationService } from './public-registration/registration.service.js';
import { PublicRegistrationController } from './public-registration/public-registration.controller.js';
import { PeopleService } from './people/people.service.js';
import { PeopleController } from './people/people.controller.js';
import { ApplicationsService } from './applications/applications.service.js';
import { ApplicationsController } from './applications/applications.controller.js';
import { DiscipleshipService } from './discipleship/discipleship.service.js';
import { DiscipleshipController } from './discipleship/discipleship.controller.js';

/**
 * The people the church cares for: what the visitor typed, and what the
 * church has done about it since.
 *
 * The public registration controller is the only part a church's own app
 * reaches, with its key; everything else is behind a session and a
 * permission like any other portal.
 */
@Module({
  controllers: [
    PublicRegistrationController,
    PeopleController,
    ApplicationsController,
    DiscipleshipController,
  ],
  providers: [
    PublicRegistrationService,
    PeopleService,
    ApplicationsService,
    DiscipleshipService,
  ],
})
export class MembershipModule {}

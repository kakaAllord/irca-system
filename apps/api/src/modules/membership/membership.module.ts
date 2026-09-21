import { Module } from '@nestjs/common';
import { PublicRegistrationService } from './public-registration/registration.service.js';
import { PublicRegistrationController } from './public-registration/public-registration.controller.js';
import { PeopleService } from './people/people.service.js';
import { PeopleController } from './people/people.controller.js';
import { ApplicationsService } from './applications/applications.service.js';
import { ApplicationsController } from './applications/applications.controller.js';

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
  ],
  providers: [
    PublicRegistrationService,
    PeopleService,
    ApplicationsService,
  ],
})
export class MembershipModule {}

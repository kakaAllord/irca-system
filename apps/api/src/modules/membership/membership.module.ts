import { Module } from '@nestjs/common';
import { PublicRegistrationService } from './public-registration/registration.service.js';
import { PublicRegistrationController } from './public-registration/public-registration.controller.js';

/**
 * The people the church cares for: what the visitor typed, and what the
 * church has done about it since.
 *
 * The public registration controller is the only part a church's own app
 * reaches, with its key; everything else here is behind a session and a
 * permission like any other portal.
 */
@Module({
  controllers: [PublicRegistrationController],
  providers: [PublicRegistrationService],
})
export class MembershipModule {}

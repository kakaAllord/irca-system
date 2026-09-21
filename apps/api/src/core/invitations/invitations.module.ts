import { Module } from '@nestjs/common';
import { InvitationController } from './invitation.controller.js';

/** The public side of an invitation: reading one, and accepting it. */
@Module({ controllers: [InvitationController] })
export class InvitationsModule {}

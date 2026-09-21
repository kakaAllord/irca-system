import { Module } from '@nestjs/common';
import { ImpersonationController } from './impersonation.controller.js';

/** Starting and stopping a view-as session. Everything else is in CoreModule. */
@Module({
  controllers: [ImpersonationController],
})
export class ImpersonationModule {}

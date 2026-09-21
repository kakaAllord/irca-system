import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { MeService } from './me.service.js';
import { PasswordService } from './password.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, MeService, PasswordService, SessionService, SessionGuard, CsrfGuard],
  exports: [PasswordService, SessionService, SessionGuard, CsrfGuard],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/** Signing in and out, and describing who is signed in. */
@Module({
  controllers: [AuthController, AccountController],
  providers: [AuthService, AccountService],
})
export class AuthModule {}

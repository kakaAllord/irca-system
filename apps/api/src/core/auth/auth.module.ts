import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/** Signing in and out, and describing who is signed in. */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

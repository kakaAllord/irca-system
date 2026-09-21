import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    // The database check arrives with the Prisma clients (step 1.9).
    return { status: 'ok', db: 'unknown', version: process.env.RELEASE ?? 'dev' };
  }
}

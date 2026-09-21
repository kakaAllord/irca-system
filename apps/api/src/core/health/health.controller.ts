import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaCore } from '../database/prisma-clients.js';
import { Public } from '../auth/decorators.js';

@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaCore) {}

  /**
   * For uptime monitors and the host's health check: 200 when the API can reach
   * its database, 503 when it cannot, so a deploy with a broken connection
   * string is never marked healthy.
   */
  @Public()
  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    let db: 'ok' | 'down' = 'ok';
    try {
      await this.db.$queryRaw`select 1`;
    } catch {
      db = 'down';
      res.status(503);
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', db, version: process.env.RELEASE ?? 'dev' };
  }
}

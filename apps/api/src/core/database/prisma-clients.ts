import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { AppConfig } from '../../config/app-config.js';

/**
 * The database connection, as `irca_app`.
 *
 * One role, one pool. What the application may not do is decided in the
 * database rather than here: it can add to the activity log and the books and
 * never rewrite them (see the init migration). There is no second role for a
 * second church, because there is no second church — another one gets its own
 * deployment and its own database.
 *
 * A failed connection gives up after five seconds rather than hanging the
 * request, and the pool stays small: on Neon a pooler sits in front anyway.
 */
@Injectable()
export class PrismaDb extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL'),
        max: 5,
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

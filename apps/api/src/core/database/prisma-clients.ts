import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { AppConfig } from '../../config/app-config.js';

/**
 * One Prisma client per database role. Prisma 7 talks to Postgres through a
 * driver adapter, and each adapter owns a small pg pool connected as its role,
 * so what a query may do is decided by which client ran it.
 *
 * A failed connection gives up after five seconds rather than hanging the
 * request, and pools stay small: on Neon a pooler sits in front anyway.
 */
function client(connectionString: string): ConstructorParameters<typeof PrismaClient>[0] {
  return {
    adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5_000 }),
  };
}

/**
 * The read-write connection, as `irca_app`.
 *
 * What the application may not do is decided in the database rather than
 * here: it can add to the activity log and the books and never rewrite them
 * (see the init migration). There is no second role for a second church,
 * because there is no second church — another one gets its own deployment and
 * its own database.
 */
@Injectable()
export class PrismaDb extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super(client(config.get('DATABASE_URL')));
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/**
 * The connection an impersonated request's feature code runs on, as
 * `irca_readonly`, which may select and nothing else. Used only inside Db.
 */
@Injectable()
export class PrismaRo extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super(client(config.get('DATABASE_URL_READONLY')));
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

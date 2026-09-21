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
 * request, and pools stay small: several roles share one Postgres, and on
 * Neon a pooler sits in front of it anyway.
 */
function client(connectionString: string): ConstructorParameters<typeof PrismaClient>[0] {
  return {
    adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5_000 }),
  };
}

/**
 * Core's own connection, as irca_core. Row-level security (Phase 2) lets this
 * role see every church, because signing in, resolving permissions, writing
 * the audit log and running jobs all happen before or across any one church.
 * That is exactly why feature code must never be handed it: only src/core and
 * the dev console (src/modules/platform) may inject it, and lint enforces that.
 */
@Injectable()
export class PrismaCore extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super(client(config.get('DATABASE_URL_CORE')));
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** Feature modules' read-write connection, as irca_app. Used only inside Db. */
@Injectable()
export class PrismaRw extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super(client(config.get('DATABASE_URL')));
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** Feature modules' connection while impersonating, as irca_readonly. Used only inside Db. */
@Injectable()
export class PrismaRo extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super(client(config.get('DATABASE_URL_READONLY')));
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

import { Controller, Get, Post } from '@nestjs/common';
import { AuthenticatedOnly } from '../src/core/auth/decorators.js';
import { RequireAnyPermission, RequirePermission } from '../src/core/rbac/decorators.js';
import { Db } from '../src/core/database/db.service.js';

/**
 * Routes that exist only in tests, to exercise the guards without waiting for
 * a real feature to be built.
 */
@Controller('fixture')
export class FixturesController {
  constructor(private readonly db: Db) {}

  @RequirePermission('admin.users.read')
  @Get('read')
  read() {
    return { ok: true };
  }

  @RequirePermission('admin.users.manage')
  @Post('write')
  write() {
    return { ok: true };
  }

  @RequireAnyPermission('admin.roles.read', 'admin.audit.read')
  @Get('any')
  any() {
    return { ok: true };
  }

  @AuthenticatedOnly()
  @Get('anyone')
  anyone() {
    return { ok: true };
  }

  /**
   * Deliberately writes on a GET, which the guards let through: it is here to
   * prove the last line of defence, the read-only database connection.
   */
  @RequirePermission('admin.users.read')
  @Get('writes-anyway')
  async writesAnyway() {
    await this.db.client.role.create({
      data: { moduleKey: 'admin', name: `sneaky ${Date.now()}` } as never,
    });
    return { ok: true };
  }
}

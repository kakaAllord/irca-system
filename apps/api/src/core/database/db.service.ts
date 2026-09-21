import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestContext } from '../context/request-context.js';
import { PrismaRo, PrismaRw } from './prisma-clients.js';

/**
 * The only way feature code reaches the database.
 *
 * While the request is impersonating, this hands out the client connected as
 * irca_readonly. That is the database half of "impersonation is read-only": a
 * handler that tries to write anyway gets "permission denied" from Postgres,
 * whatever the guards above it missed.
 *
 * Phase 2 makes `client` return tenant-scoped versions of these clients, which
 * also set the church for row-level security on every transaction.
 */
@Injectable()
export class Db {
  constructor(
    private readonly rw: PrismaRw,
    private readonly ro: PrismaRo,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  get client(): PrismaClient {
    return this.cls.get('impersonationId') ? this.ro : this.rw;
  }
}

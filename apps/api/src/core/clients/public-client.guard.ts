import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { ErrorCode } from '@irca/shared';
import { AppError } from '../http/app-error.js';
import type { RequestContext } from '../context/request-context.js';
import { PUBLIC_CLIENT_KEY } from '../rbac/decorators.js';
import { ApiClientService } from './api-client.service.js';

/**
 * Lets a church's own app in, as that church and as nobody in particular.
 *
 * The registration form has no signed-in person: the visitor filling it in is
 * not a user of this system and never will be. What the form does have is a
 * key, held on its server and never sent to a browser, and the key says which
 * church's registrations it may write. That is all this sets: a church, no
 * user, no permissions.
 */
@Injectable()
export class PublicClientGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly clients: ApiClientService,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const kind = this.reflector.getAllAndOverride<string>(PUBLIC_CLIENT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!kind) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.get('authorization') ?? '';
    const key = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const client = key ? await this.clients.resolve(key, kind) : null;
    if (!client) {
      throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'This app is not allowed to do that.');
    }

    this.cls.set('apiClientId', client.id);
    return true;
  }
}

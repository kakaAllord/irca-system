import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ClsModule, type ClsMiddlewareOptions } from 'nestjs-cls';
import type { Request, Response } from 'express';

// A caller may pass its own request id (the portal does, so one id follows a
// page load through both apps), but only a short, plain one: it is echoed in
// headers and logs, so it must not be a place to smuggle text.
const INCOMING_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * The request context middleware's options. main.ts mounts it by hand, first,
 * ahead of the body parser: mounted by the module it would run after body
 * parsing, and a request with broken JSON would fail with no request id.
 */
export const requestContextOptions: ClsMiddlewareOptions = {
  generateId: true,
  idGenerator: (req: Request) => {
    const incoming = req.get('x-request-id');
    return incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  },
  setup: (cls, req: Request, res: Response) => {
    res.setHeader('x-request-id', cls.getId());
    cls.set('ip', req.ip ?? null);
    cls.set('userAgent', req.get('user-agent')?.slice(0, 400) ?? null);
    cls.set('sessionId', null);
    cls.set('userId', null);
    cls.set('actorUserId', null);
    cls.set('impersonationId', null);
    cls.set('permissions', new Set<string>());
    cls.set('apiClientId', null);
  },
};

@Module({
  imports: [ClsModule.forRoot({ global: true, middleware: { mount: false } })],
})
export class RequestContextModule {}

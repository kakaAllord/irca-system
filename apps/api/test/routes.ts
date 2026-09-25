import type { NestExpressApplication } from '@nestjs/platform-express';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { PERMISSIONS_KEY, type PermissionRule } from '../src/core/rbac/decorators.js';

/**
 * The routes the controllers declare, read from the controllers themselves,
 * for tests that sweep every one: the permission matrix, and the walls each
 * portal promises. A route added tomorrow is in them the moment it exists.
 */
export type Route = {
  method: 'get' | 'post' | 'put' | 'patch' | 'del';
  path: string;
  rule: PermissionRule;
};

const VERBS: Partial<Record<RequestMethod, Route['method']>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'del',
};

/** Every route that names the permission it needs, read from the controllers themselves. */
export function guardedRoutes(app: NestExpressApplication): Route[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const join = (...parts: string[]) =>
    '/' +
    parts
      .map((p) => p.replace(/^\/|\/$/g, ''))
      .filter(Boolean)
      .join('/');
  const routes: Route[] = [];
  for (const wrapper of discovery.getControllers()) {
    const cls = wrapper.metatype as Type<object> | undefined;
    if (!cls?.prototype) continue;
    const base = reflector.get<string>(PATH_METADATA, cls) ?? '';
    const classRule = reflector.get<PermissionRule>(PERMISSIONS_KEY, cls);
    for (const name of scanner.getAllMethodNames(cls.prototype)) {
      const handler = cls.prototype[name as keyof object] as () => unknown;
      const method = VERBS[reflector.get<RequestMethod>(METHOD_METADATA, handler)];
      const rule = reflector.get<PermissionRule>(PERMISSIONS_KEY, handler) ?? classRule;
      if (!method || !rule) continue;
      const path = reflector.get<string>(PATH_METADATA, handler) ?? '';
      routes.push({ method, path: join('v1', base, path), rule });
    }
  }
  return routes;
}

/** Refused by the permission guard itself, rather than by anything the route does. */
export const refusedByGuard = (res: { status: number; body: { error?: { details?: unknown } } }) =>
  res.status === 403 &&
  Array.isArray((res.body.error?.details as { required?: unknown })?.required);

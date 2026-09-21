import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  RequestMethod,
  type Type,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { permissionKind } from '@irca/shared';
import { AUTHENTICATED_ONLY, IS_PUBLIC } from '../auth/decorators.js';
import {
  PERMISSIONS_KEY,
  PUBLIC_CLIENT_KEY,
  WRITE_WITH_READ_KEY,
  type PermissionRule,
} from './decorators.js';

/**
 * Refuses to start the API if any route does not say who may call it.
 *
 * Forgetting an access rule is the easiest security mistake to make and the
 * hardest to notice, because the route simply works. Here it is impossible to
 * ship: the app will not boot, and it names the handler.
 *
 * It also refuses a route that changes something while asking only for read
 * permissions, unless it explains itself with @WriteWithReadPermission.
 */
@Injectable()
export class RouteAudit implements OnApplicationBootstrap {
  private readonly logger = new Logger('RouteAudit');

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap() {
    const problems: string[] = [];
    let routes = 0;

    for (const wrapper of this.discovery.getControllers()) {
      const cls = wrapper.metatype as Type<object> | undefined;
      if (!cls?.prototype) continue;

      for (const name of this.scanner.getAllMethodNames(cls.prototype)) {
        const handler = cls.prototype[name] as (...args: unknown[]) => unknown;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        routes++;

        const targets = [handler, cls];
        const declared = [IS_PUBLIC, AUTHENTICATED_ONLY, PERMISSIONS_KEY, PUBLIC_CLIENT_KEY].some(
          (key) => this.reflector.getAllAndOverride(key, targets) !== undefined,
        );
        if (!declared) {
          problems.push(`${cls.name}.${name} has no access rule`);
          continue;
        }

        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const rule = this.reflector.getAllAndOverride<PermissionRule>(PERMISSIONS_KEY, targets);
        const excused = this.reflector.getAllAndOverride<string>(WRITE_WITH_READ_KEY, targets);
        if (rule && method !== undefined && method !== RequestMethod.GET && !excused) {
          const keys = rule.all ?? rule.any ?? [];
          if (keys.length && !keys.some((k) => permissionKind(k) === 'write')) {
            problems.push(
              `${cls.name}.${name} is a ${RequestMethod[method]} guarded only by read permissions`,
            );
          }
        }
      }
    }

    if (problems.length) throw new Error(`Unsafe routes:\n  ${problems.join('\n  ')}`);
    this.logger.log(`${routes} routes, every one with an access rule`);
  }
}

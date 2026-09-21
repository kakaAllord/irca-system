import type { ModuleDef, PermissionDef, PermissionKind } from '../rbac/define';
import { adminModule } from './admin';
import { platformModule } from './platform';

/**
 * Every module a church can have. Order is the sidebar's order, except that
 * admin is always shown last.
 *
 * Phase 4 adds finance, Phase 5 membership. Adding one here, and nowhere else,
 * is what makes it appear in the Portals page, the role editor and the sidebar.
 */
export const CHURCH_MODULES: ModuleDef[] = [adminModule];

export { adminModule, platformModule };

export const ALL_MODULES: ModuleDef[] = [...CHURCH_MODULES, platformModule];

export const ALL_PERMISSIONS: Record<string, PermissionDef> = Object.assign(
  {},
  ...ALL_MODULES.map((m) => m.permissions),
);

export type PermissionKey = string;

export const moduleByKey = (key: string): ModuleDef | undefined =>
  ALL_MODULES.find((m) => m.key === key);

export const permissionKind = (key: string): PermissionKind | undefined =>
  ALL_PERMISSIONS[key]?.kind;

export const isWritePermission = (key: string): boolean => permissionKind(key) === 'write';

/** Every permission a module owns, e.g. for the role editor. */
export const permissionsOfModule = (moduleKey: string): [string, PermissionDef][] =>
  Object.entries(moduleByKey(moduleKey)?.permissions ?? {});

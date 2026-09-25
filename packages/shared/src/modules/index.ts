import type { ModuleDef, PermissionDef, PermissionKind } from '../rbac/define';
import { adminModule } from './admin';
import { financeModule } from './finance';
import { membershipModule } from './membership';
import { devModule } from './dev';
import { departmentsModule } from './departments';
import { commsModule } from './comms';

/**
 * Every portal this system has. Order is the sidebar's order, except that
 * admin and the dev console are always shown last.
 *
 * Adding one here, and nowhere else, is what makes it appear in the Portals
 * page, the role editor and the sidebar.
 */
export const CHURCH_MODULES: ModuleDef[] = [
  membershipModule,
  financeModule,
  commsModule,
  departmentsModule,
  adminModule,
  devModule,
];

export { adminModule, financeModule, membershipModule, devModule, departmentsModule, commsModule };

export const ALL_MODULES: ModuleDef[] = CHURCH_MODULES;

export const ALL_PERMISSIONS: Record<string, PermissionDef> = Object.assign(
  {},
  ...ALL_MODULES.map((m) => m.permissions),
);

export type PermissionKey = string;

/**
 * The permissions leading a department holds (D28), with the module each
 * belongs to, so the resolver can leave out those of a portal that is off.
 */
export const LEADERSHIP_PERMISSIONS: { key: string; moduleKey: string }[] = ALL_MODULES.flatMap(
  (m) =>
    Object.entries(m.permissions)
      .filter(([, def]) => def.fromLeadership)
      .map(([key]) => ({ key, moduleKey: m.key })),
);

/**
 * What leading the department a portal belongs to allows in that portal
 * (D29), with the portal, so the resolver adds each only for the leaders of
 * that portal's own department.
 */
export const PORTAL_LEADER_PERMISSIONS: { key: string; moduleKey: string }[] = ALL_MODULES.flatMap(
  (m) => (m.leaders?.permissions ?? []).map((key) => ({ key, moduleKey: m.key })),
);

/** Whether a permission can be put in a role. Leadership ones cannot. */
export const isAssignable = (key: string): boolean =>
  key in ALL_PERMISSIONS && !ALL_PERMISSIONS[key]!.fromLeadership;

export const moduleByKey = (key: string): ModuleDef | undefined =>
  ALL_MODULES.find((m) => m.key === key);

export const permissionKind = (key: string): PermissionKind | undefined =>
  ALL_PERMISSIONS[key]?.kind;

export const isWritePermission = (key: string): boolean => permissionKind(key) === 'write';

/** Every permission a module owns, e.g. for the role editor. */
export const permissionsOfModule = (moduleKey: string): [string, PermissionDef][] =>
  Object.entries(moduleByKey(moduleKey)?.permissions ?? {});

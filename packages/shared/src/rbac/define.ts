/**
 * A module (a "portal" to the people using it) describes itself here: what it
 * lets people do, the roles it ships with, and the pages it adds to the
 * sidebar. Code checks permissions, never role names, so a church can invent
 * roles without a deploy, but never a permission nothing checks.
 */
export type PermissionKind = 'read' | 'write';

export type PermissionDef = {
  kind: PermissionKind;
  /** Shown to administrators in the role editor, in plain words. */
  label: string;
  /** A longer note, for permissions that deserve a second thought. */
  hint?: string;
};

/**
 * The drawings the sidebar has. A module picks one by name rather than
 * shipping a picture, so every portal's sidebar is drawn in one style and a
 * name nothing can draw does not compile.
 */
export type NavIcon =
  | 'overview'
  | 'transactions'
  | 'lists'
  | 'requests'
  | 'reports'
  | 'people'
  | 'roles'
  | 'portals'
  | 'activity'
  | 'churches'
  | 'terminal'
  | 'health';

export type NavItem = {
  label: string;
  /** Absolute portal path, e.g. /finance/transactions. */
  href: string;
  /** Which of the sidebar's drawings goes beside it. */
  icon: NavIcon;
  /** Shown only to people who hold this permission. */
  permission: string;
};

export type SystemRoleDef = {
  /** Stable id, e.g. finance.clerk. Never rename: roles are matched by it. */
  key: string;
  name: string;
  description: string;
  permissions: string[];
};

export type ModuleDef = {
  key: string;
  name: string;
  description: string;
  /** Core modules cannot be turned off. Only admin is core. */
  kind: 'core' | 'department';
  /** Where the module opens. */
  home: string;
  permissions: Record<string, PermissionDef>;
  systemRoles: SystemRoleDef[];
  nav: NavItem[];
};

export function defineModule<const M extends ModuleDef>(m: M): M {
  for (const key of Object.keys(m.permissions)) {
    // Ownership has to be readable from the string alone, and two modules must
    // never be able to collide.
    if (!key.startsWith(`${m.key}.`)) throw new Error(`${key} does not belong to module ${m.key}`);
  }
  for (const role of m.systemRoles) {
    for (const p of role.permissions) {
      if (!(p in m.permissions)) throw new Error(`Role ${role.key} uses unknown permission ${p}`);
    }
  }
  for (const item of m.nav) {
    if (!(item.permission in m.permissions)) {
      throw new Error(`Nav ${item.href} uses unknown permission ${item.permission}`);
    }
  }
  return m;
}

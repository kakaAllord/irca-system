import { defineModule } from '../rbac/define';

/**
 * The dev console. Not a church module: it is never listed in church_modules
 * and no role grants it. These permissions come with platform_role = DEV.
 */
export const platformModule = defineModule({
  key: 'platform',
  name: 'Dev console',
  description: 'Every church, its usage, and the platform itself.',
  kind: 'core',
  home: '/platform',
  permissions: {
    'platform.churches.read': { kind: 'read', label: 'See every church and its usage' },
    'platform.churches.manage': { kind: 'write', label: 'Create, suspend and reactivate churches' },
    'platform.usage.read': { kind: 'read', label: 'See usage over time' },
    'platform.health.read': { kind: 'read', label: 'See platform health' },
    'platform.users.impersonate': {
      kind: 'read',
      label: 'View the portal as anyone, in any church',
    },
    'platform.impersonations.read': {
      kind: 'read',
      label: 'Read the impersonation log',
      hint: 'The only place anyone can see who viewed as whom.',
    },
  },
  systemRoles: [],
  nav: [
    { label: 'Churches', href: '/platform', mark: 'C', permission: 'platform.churches.read' },
    {
      label: 'View-as log',
      href: '/platform/impersonations',
      mark: '>',
      permission: 'platform.impersonations.read',
    },
    { label: 'Health', href: '/platform/health', mark: 'H', permission: 'platform.health.read' },
  ],
});

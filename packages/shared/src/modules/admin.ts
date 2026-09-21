import { defineModule } from '../rbac/define';

/**
 * The church's own administration: who has access, what they may do, which
 * portals are on, and what has been changed. Always on, because a church
 * without it could never give anyone else access.
 */
export const adminModule = defineModule({
  key: 'admin',
  name: 'Admin',
  description: 'People, access and portals for this church.',
  kind: 'core',
  home: '/admin/users',
  permissions: {
    'admin.users.read': { kind: 'read', label: 'See who has access' },
    'admin.users.invite': { kind: 'write', label: 'Invite new people' },
    'admin.users.manage': { kind: 'write', label: 'Change roles, disable and re-enable people' },
    'admin.users.impersonate': {
      kind: 'read',
      label: 'View the portal as another person (read-only)',
      hint: 'Every use is logged for the platform team. The person viewed is not told.',
    },
    'admin.roles.read': { kind: 'read', label: 'See roles and what they allow' },
    'admin.roles.manage': { kind: 'write', label: 'Create and edit custom roles' },
    'admin.modules.read': { kind: 'read', label: 'See which portals are on' },
    'admin.modules.manage': { kind: 'write', label: 'Turn portals on and off' },
    'admin.requests.read': { kind: 'read', label: 'See change requests from every portal' },
    'admin.requests.decide': { kind: 'write', label: 'Approve or reject change requests' },
    'admin.audit.read': { kind: 'read', label: 'Read the activity log' },
    'admin.church.manage': { kind: 'write', label: 'Edit church details' },
  },
  systemRoles: [
    {
      key: 'admin.administrator',
      name: 'Church administrator',
      description: 'Full control of people, roles, portals and change requests.',
      permissions: [
        'admin.users.read',
        'admin.users.invite',
        'admin.users.manage',
        'admin.users.impersonate',
        'admin.roles.read',
        'admin.roles.manage',
        'admin.modules.read',
        'admin.modules.manage',
        'admin.requests.read',
        'admin.requests.decide',
        'admin.audit.read',
        'admin.church.manage',
      ],
    },
    {
      key: 'admin.auditor',
      name: 'Auditor',
      description: 'Can see who has access and read the activity log, and change nothing.',
      permissions: [
        'admin.users.read',
        'admin.roles.read',
        'admin.modules.read',
        'admin.requests.read',
        'admin.audit.read',
      ],
    },
  ],
  nav: [
    { label: 'Requests', href: '/admin/requests', mark: 'Q', permission: 'admin.requests.read' },
    { label: 'People', href: '/admin/users', mark: 'P', permission: 'admin.users.read' },
    { label: 'Roles', href: '/admin/roles', mark: 'R', permission: 'admin.roles.read' },
    { label: 'Portals', href: '/admin/portals', mark: 'O', permission: 'admin.modules.read' },
    { label: 'Activity', href: '/admin/audit', mark: 'L', permission: 'admin.audit.read' },
  ],
});

import { defineModule } from '../rbac/define';

/**
 * What a department's leaders see: the departments they lead, and the people
 * in them (D28).
 *
 * Nobody is given these permissions. Leading a department is what holds them,
 * so they arrive when an administrator names someone a leader and are gone
 * the moment that leadership ends. Always on, because it belongs to no
 * department: every department's leaders use it.
 */
export const departmentsModule = defineModule({
  key: 'departments',
  name: 'My departments',
  description: 'The departments you lead, and who is in them.',
  kind: 'core',
  home: '/departments',
  permissions: {
    'departments.own.read': {
      kind: 'read',
      label: 'See the departments you lead, their leaders and their members',
      fromLeadership: true,
    },
    'departments.own.members': {
      kind: 'write',
      label: 'Add and remove members of the departments you lead',
      fromLeadership: true,
    },
  },
  systemRoles: [],
  nav: [
    {
      label: 'My departments',
      href: '/departments',
      icon: 'departments',
      permission: 'departments.own.read',
    },
  ],
});

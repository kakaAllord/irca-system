import { defineModule } from '../rbac/define';

/**
 * Communications: the text messages the church sends, and the standards they
 * follow (D21, as amended by D28).
 *
 * Central control and decentralised sending. This portal holds the Beem
 * account, approves the words of every template, sends to the whole church,
 * to departments and to their leaders, and sees what it all cost. A
 * department's leaders send their own routine messages without asking —
 * because the words were approved once, when they were written — and that
 * comes from leading the department, not from a role here: the three
 * `comms.department.*` permissions are held by being a leader.
 */
export const commsModule = defineModule({
  key: 'comms',
  name: 'Communications',
  description: 'Messages the church sends, and the standards they follow.',
  kind: 'department',
  home: '/comms',
  permissions: {
    'comms.messages.read': { kind: 'read', label: 'See every message the church sent' },
    'comms.messages.send': {
      kind: 'write',
      label: 'Send to the whole church, to departments and to their leaders',
    },
    'comms.messages.send_adhoc': {
      kind: 'write',
      label: 'Send words no template covers',
      hint: 'For emergencies: the road is flooded, the service is cancelled. Held by the Communications lead.',
    },
    'comms.messages.cancel': { kind: 'write', label: 'Stop a scheduled or sending message' },
    'comms.templates.read': { kind: 'read', label: 'See message templates' },
    'comms.templates.draft': { kind: 'write', label: 'Write and change templates' },
    'comms.templates.approve': {
      kind: 'write',
      label: 'Approve a template for use',
      hint: 'Nobody approves their own.',
    },
    'comms.audiences.read': { kind: 'read', label: 'See who the audiences are' },
    'comms.audiences.manage': {
      kind: 'write',
      label: 'Give departments the use of church-wide audiences',
    },
    'comms.schedules.read': { kind: 'read', label: 'See recurring messages' },
    'comms.schedules.manage': { kind: 'write', label: 'Set up recurring messages' },
    'comms.costs.read': { kind: 'read', label: 'See what messages cost and the credit left' },
    'comms.settings.manage': {
      kind: 'write',
      label: 'Set the Beem account, the sender name, the daily limit and the price',
      hint: 'The Beem key and secret are never shown again once saved.',
    },
    'comms.department.read': {
      kind: 'read',
      label: 'See the messages and templates of the departments you lead',
      fromLeadership: true,
    },
    'comms.department.draft': {
      kind: 'write',
      label: 'Draft templates for the departments you lead, and ask for approval',
      fromLeadership: true,
    },
    'comms.department.send': {
      kind: 'write',
      label: 'Send approved templates to the departments you lead',
      fromLeadership: true,
    },
  },
  systemRoles: [
    {
      key: 'comms.lead',
      name: 'Communications lead',
      description:
        'Everything: sending anywhere, free text, approving templates, audiences, recurring messages and the Beem account.',
      permissions: [
        'comms.messages.read',
        'comms.messages.send',
        'comms.messages.send_adhoc',
        'comms.messages.cancel',
        'comms.templates.read',
        'comms.templates.draft',
        'comms.templates.approve',
        'comms.audiences.read',
        'comms.audiences.manage',
        'comms.schedules.read',
        'comms.schedules.manage',
        'comms.costs.read',
        'comms.settings.manage',
      ],
    },
    {
      key: 'comms.sender',
      name: 'Communications sender',
      description: 'Write and send with approved templates. Cannot approve, or send free text.',
      permissions: [
        'comms.messages.read',
        'comms.messages.send',
        'comms.templates.read',
        'comms.templates.draft',
        'comms.audiences.read',
        'comms.schedules.read',
        'comms.costs.read',
      ],
    },
    {
      key: 'comms.viewer',
      name: 'Communications viewer',
      description: 'See what was sent and the templates. Change nothing.',
      permissions: [
        'comms.messages.read',
        'comms.templates.read',
        'comms.audiences.read',
        'comms.schedules.read',
      ],
    },
  ],
  nav: [
    { label: 'Overview', href: '/comms', icon: 'overview', permission: 'comms.messages.read' },
    {
      label: 'Compose',
      href: '/comms/compose',
      icon: 'messages',
      permission: 'comms.messages.send',
    },
    {
      label: 'History',
      href: '/comms/history',
      icon: 'activity',
      permission: 'comms.messages.read',
    },
    {
      label: 'Templates',
      href: '/comms/templates',
      icon: 'templates',
      permission: 'comms.templates.read',
    },
    {
      label: 'Recurring',
      href: '/comms/schedules',
      icon: 'schedule',
      permission: 'comms.schedules.read',
    },
    {
      label: 'Audiences',
      href: '/comms/audiences',
      icon: 'people',
      permission: 'comms.audiences.read',
    },
    {
      label: 'Settings',
      href: '/comms/settings',
      icon: 'settings',
      permission: 'comms.settings.manage',
    },
  ],
});

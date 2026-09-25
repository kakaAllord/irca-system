import { defineModule } from '../rbac/define';

const ALL = [
  'outreach.dashboard.read',
  'outreach.team.read',
  'outreach.groups.manage',
  'outreach.sessions.read',
  'outreach.sessions.manage',
  'outreach.reached.read',
  'outreach.reached.record',
  'outreach.training.read',
  'outreach.training.manage',
  'outreach.reports.read',
  'outreach.reports.upload',
];

/**
 * Evangelism: the team, the Saturdays, the people reached and the follow-up.
 *
 * The team is the Outreach department itself (D28): its leaders and members,
 * kept in My departments, so there is nothing here to add people to a team.
 * Its leaders run this portal by leading the department (D29) and need no
 * role; the people who go out and record sign in as Outreach members.
 *
 * Someone reached on a doorstep becomes a person in the church's one list
 * (D23). What this portal shows about them — name, phone, area and timeline —
 * it shows only for people it reached, behind its own permission, and never
 * the rest of People: Membership keeps that, and what people wrote in
 * confidence, behind its own.
 */
export const outreachModule = defineModule({
  key: 'outreach',
  name: 'Outreach',
  description: 'Evangelism: the team, the Saturdays, the people reached and the follow-up.',
  kind: 'department',
  home: '/outreach',
  permissions: {
    'outreach.dashboard.read': { kind: 'read', label: 'See the Outreach dashboard' },
    'outreach.team.read': { kind: 'read', label: 'See the team and its partner groups' },
    'outreach.groups.manage': { kind: 'write', label: 'Make and change partner groups' },
    'outreach.sessions.read': { kind: 'read', label: 'See the Saturday sessions' },
    'outreach.sessions.manage': {
      kind: 'write',
      label: 'Plan a Saturday, send teams to areas, and close it',
    },
    'outreach.reached.read': {
      kind: 'read',
      label: 'See the people reached, with their phone numbers, and their timelines',
      hint: 'Only people Outreach reached. The rest of People stays in Membership.',
    },
    'outreach.reached.record': {
      kind: 'write',
      label: 'Record someone reached, and follow them up',
    },
    'outreach.training.read': { kind: 'read', label: 'See the Friday training' },
    'outreach.training.manage': { kind: 'write', label: 'Plan training and mark who came' },
    'outreach.reports.read': { kind: 'read', label: 'See and download session reports' },
    'outreach.reports.upload': { kind: 'write', label: 'Attach a session report' },
  },
  leaders: {
    description:
      'Leaders of the Outreach department run it: the partner groups, the Saturdays, the training and the reports.',
    permissions: ALL,
  },
  systemRoles: [
    {
      key: 'outreach.member',
      name: 'Outreach member',
      description: 'Goes out on Saturdays, records who was reached and follows them up.',
      permissions: [
        'outreach.dashboard.read',
        'outreach.team.read',
        'outreach.sessions.read',
        'outreach.reached.read',
        'outreach.reached.record',
        'outreach.training.read',
        'outreach.reports.read',
      ],
    },
    {
      key: 'outreach.viewer',
      name: 'Outreach viewer',
      description: 'A pastor or overseer who reads the numbers without changing anything.',
      permissions: [
        'outreach.dashboard.read',
        'outreach.team.read',
        'outreach.sessions.read',
        'outreach.reached.read',
        'outreach.training.read',
        'outreach.reports.read',
      ],
    },
  ],
  nav: [
    {
      label: 'Dashboard',
      href: '/outreach',
      icon: 'dashboard',
      permission: 'outreach.dashboard.read',
    },
    {
      label: 'Saturdays',
      href: '/outreach/sessions',
      icon: 'sessions',
      permission: 'outreach.sessions.read',
    },
    {
      label: 'Reached',
      href: '/outreach/reached',
      icon: 'people',
      permission: 'outreach.reached.read',
    },
    {
      label: 'Follow-up',
      href: '/outreach/followup',
      icon: 'discipleship',
      permission: 'outreach.reached.read',
    },
    { label: 'Team', href: '/outreach/team', icon: 'roles', permission: 'outreach.team.read' },
    {
      label: 'Training',
      href: '/outreach/training',
      icon: 'training',
      permission: 'outreach.training.read',
    },
  ],
});

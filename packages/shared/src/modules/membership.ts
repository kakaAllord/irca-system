import { defineModule } from '../rbac/define';

/**
 * The people the church is caring for, from the first Sunday they register to
 * the day they are confirmed as members.
 *
 * Two words, two meanings: a `ChurchMembership` in code is a staff account's
 * access to a church. This portal is about *church members* — `Person`,
 * `MembershipApplication` and the rest. Nothing here calls a Person a member
 * except by their stage.
 *
 * What people wrote on the form in confidence — prayer requests, their faith
 * and family answers, their date of birth — sits behind its own permission,
 * so the follow-up team can do its work without reading any of it.
 */
export const membershipModule = defineModule({
  key: 'membership',
  name: 'Membership',
  description: 'Visitors, members, foundation class and what the form tells you.',
  kind: 'department',
  home: '/membership',
  permissions: {
    'membership.dashboard.read': { kind: 'read', label: 'See the membership dashboard' },
    'membership.people.read': {
      kind: 'read',
      label:
        "See people's names, gender, age group, phone, where they live, how they heard, and their stage",
    },
    'membership.people.read_sensitive': {
      kind: 'read',
      label:
        'See email, date of birth, faith and family answers, prayer requests, what they liked, and notes',
      hint: 'Prayer requests are private. Give this only to pastors and the office.',
    },
    'membership.people.update': {
      kind: 'write',
      label: 'Mark saved or baptised, move people between stages, and add people by hand',
    },
    'membership.people.export': { kind: 'read', label: 'Download people as CSV' },
    'membership.notes.write': { kind: 'write', label: 'Add notes and log visits and calls' },
    'membership.registrations.remind': {
      kind: 'write',
      label: 'See and send a person their registration link',
    },
    'membership.applications.read': { kind: 'read', label: 'See membership applications' },
    'membership.applications.submit': {
      kind: 'write',
      label: 'Enter a membership application for someone',
    },
    'membership.applications.decide': {
      kind: 'write',
      label: 'Approve, reject and confirm applications',
      hint: "The pastors' decision.",
    },
    'membership.discipleship.read': { kind: 'read', label: 'See foundation classes and progress' },
    'membership.discipleship.manage': {
      kind: 'write',
      label: 'Run foundation classes: groups, sign-ups and attendance',
    },
    'membership.insights.read': { kind: 'read', label: 'See insights' },
  },
  systemRoles: [
    {
      key: 'membership.pastor',
      name: 'Pastor',
      description:
        'Everything, including reading what people wrote in confidence and deciding applications.',
      permissions: [
        'membership.dashboard.read',
        'membership.people.read',
        'membership.people.read_sensitive',
        'membership.people.update',
        'membership.people.export',
        'membership.notes.write',
        'membership.registrations.remind',
        'membership.applications.read',
        'membership.applications.submit',
        'membership.applications.decide',
        'membership.discipleship.read',
        'membership.discipleship.manage',
        'membership.insights.read',
      ],
    },
    {
      key: 'membership.secretary',
      name: 'Office secretary',
      description: 'Everything a pastor can, except deciding applications.',
      permissions: [
        'membership.dashboard.read',
        'membership.people.read',
        'membership.people.read_sensitive',
        'membership.people.update',
        'membership.people.export',
        'membership.notes.write',
        'membership.registrations.remind',
        'membership.applications.read',
        'membership.applications.submit',
        'membership.discipleship.read',
        'membership.discipleship.manage',
        'membership.insights.read',
      ],
    },
    {
      key: 'membership.followup',
      name: 'Follow-up team',
      description:
        'Visit and call people, send them their link, and run the foundation class. Cannot read prayer requests.',
      permissions: [
        'membership.dashboard.read',
        'membership.people.read',
        'membership.notes.write',
        'membership.registrations.remind',
        'membership.discipleship.read',
        'membership.discipleship.manage',
      ],
    },
    {
      key: 'membership.viewer',
      name: 'Membership viewer',
      description: 'See how things stand, and change nothing.',
      permissions: [
        'membership.dashboard.read',
        'membership.people.read',
        'membership.applications.read',
        'membership.discipleship.read',
        'membership.insights.read',
      ],
    },
  ],
  nav: [
    {
      label: 'Dashboard',
      href: '/membership',
      icon: 'dashboard',
      permission: 'membership.dashboard.read',
    },
    {
      label: 'Members',
      href: '/membership/people',
      icon: 'people',
      permission: 'membership.people.read',
    },
    {
      label: 'Applications',
      href: '/membership/applications',
      icon: 'applications',
      permission: 'membership.applications.read',
    },
    {
      label: 'Discipleship',
      href: '/membership/discipleship',
      icon: 'discipleship',
      permission: 'membership.discipleship.read',
    },
    {
      label: 'Insights',
      href: '/membership/insights',
      icon: 'insights',
      permission: 'membership.insights.read',
    },
  ],
});

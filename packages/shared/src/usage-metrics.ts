/**
 * Every usage metric the system keeps, in one place.
 *
 * The dev console draws from this list, so adding a metric is one line here
 * plus the code that counts it. `counter` values add up over a day, `max`
 * keeps the largest seen, and `gauge` is a snapshot the nightly job replaces.
 * One row per metric per day, in `usage_daily`.
 *
 * Metrics named with a `.<something>` tail (per table, per module, per route)
 * are listed once with `*` and expanded by whatever writes them.
 */
export type MetricType = 'counter' | 'max' | 'gauge';
export type MetricUnit = 'count' | 'bytes' | 'ms' | 'minutes';

export type MetricDef = {
  key: string;
  area: string;
  type: MetricType;
  unit: MetricUnit;
  label: string;
};

const m = (
  area: string,
  key: string,
  type: MetricType,
  label: string,
  unit: MetricUnit = 'count',
): MetricDef => ({ area, key, type, label, unit });

export const USAGE_METRICS: MetricDef[] = [
  m('Database', 'db.rows.*', 'gauge', 'Rows in each table'),
  m('Database', 'db.bytes.*', 'gauge', 'Size of each table, with its indexes', 'bytes'),
  m('Database', 'db.bytes.total', 'gauge', 'Size of all the tables', 'bytes'),
  m('Database', 'db.size_bytes', 'gauge', 'Size of the whole database', 'bytes'),
  m('Database', 'db.connections.max_today', 'max', 'Most connections at once'),

  m('Entities', 'entities.people', 'gauge', 'People'),
  m('Entities', 'entities.registrations.in_progress', 'gauge', 'Unfinished registrations'),
  m('Entities', 'entities.registrations.submitted', 'gauge', 'Finished registrations'),
  m('Entities', 'entities.members.confirmed', 'gauge', 'Confirmed members'),
  m('Entities', 'entities.finance.transactions', 'gauge', 'Finance entries'),
  m('Entities', 'entities.finance.items', 'gauge', 'Income sources and expense items'),
  m('Entities', 'entities.users.active', 'gauge', 'Staff who can sign in'),
  m('Entities', 'entities.users.invited', 'gauge', 'Staff still invited'),
  m('Entities', 'entities.users.disabled', 'gauge', 'Staff disabled'),
  m('Entities', 'entities.roles.custom', 'gauge', 'Custom roles'),
  m('Entities', 'entities.modules.enabled', 'gauge', 'Portals turned on'),

  // Read from user_activity_daily rather than written here: one row per
  // person per day already exists there, and counting them is the answer.
  m('Activity', 'users.active', 'gauge', 'Staff active that day'),

  m('Departments', 'departments.leaders.named', 'counter', 'Department leaders named'),
  m('Departments', 'departments.members.added', 'counter', 'People added to departments'),

  m('Storage', 'storage.files', 'gauge', 'Files kept (current versions)'),
  m('Storage', 'storage.bytes', 'gauge', 'Size of every file kept, older versions too', 'bytes'),

  m('Outreach', 'outreach.reached', 'counter', 'People recorded as reached'),
  m('Outreach', 'outreach.followups', 'counter', 'Calls, visits and invitations'),
  m('Outreach', 'outreach.visits', 'counter', 'Home visits'),
  m('Outreach', 'outreach.sessions', 'counter', 'Saturdays marked completed'),
  m('Outreach', 'outreach.training.attendance', 'counter', 'People marked present at training'),
  m('Outreach', 'outreach.followups.pending', 'gauge', 'People awaiting follow-up'),

  m('Messages', 'sms.queued', 'counter', 'Messages queued'),
  m('Messages', 'sms.sent', 'counter', 'Messages sent'),
  m('Messages', 'sms.delivered', 'counter', 'Messages delivered'),
  m('Messages', 'sms.failed', 'counter', 'Messages that failed'),
  m('Messages', 'sms.skipped_opt_out', 'counter', 'People left alone because they asked'),
  m('Messages', 'sms.segments', 'counter', 'Segments sent (what the carrier bills)'),
  m('Messages', 'sms.cost', 'counter', 'What messages cost, in TZS'),
  m('Messages', 'sms.balance', 'gauge', 'Beem credit left, in TZS'),
  m('Messages', 'sms.replies', 'counter', 'Replies kept for Communications to read'),
  m('Messages', 'sms.replies.stop', 'counter', 'Replies that said STOP'),
  m('Messages', 'comms.templates.approved', 'counter', 'Templates approved'),

  m('API', 'api.requests', 'counter', 'Requests'),
  m('API', 'api.requests.*', 'counter', 'Requests by module'),
  m('API', 'api.route.*', 'counter', 'Requests by route (the template, never the real path)'),
  m('API', 'api.route_ms.*', 'counter', 'Time spent answering each route', 'ms'),
  m('API', 'api.errors.4xx', 'counter', 'Requests refused (4xx)'),
  m('API', 'api.errors.5xx', 'counter', 'Requests that failed (5xx)'),
  m('API', 'api.errors.403', 'counter', 'Permission denials'),
  m('API', 'api.throttled', 'counter', 'Requests slowed down for going too fast'),
  m('API', 'api.latency_ms.sum', 'counter', 'Total time answering (for the average)', 'ms'),
  m('API', 'api.latency_ms.max', 'max', 'Slowest request', 'ms'),

  m('Auth', 'auth.logins', 'counter', 'Sign-ins'),
  m('Auth', 'auth.login_failures', 'counter', 'Failed sign-ins'),
  m('Auth', 'auth.lockouts', 'counter', 'Accounts locked for too many failures'),
  m('Auth', 'auth.password_resets', 'counter', 'Password resets'),
  m('Auth', 'auth.sessions_created', 'counter', 'Sessions started'),
  m('Auth', 'auth.sessions.active', 'gauge', 'Sessions open'),

  m('Impersonation', 'impersonation.started', 'counter', 'View-as sessions started'),
  m('Impersonation', 'impersonation.views', 'counter', 'Pages viewed as someone else'),
  m('Impersonation', 'impersonation.minutes', 'counter', 'Minutes spent viewing as', 'minutes'),

  m('Admin', 'admin.invitations.sent', 'counter', 'Invitations sent'),
  m('Admin', 'admin.invitations.accepted', 'counter', 'Invitations accepted'),
  m('Admin', 'admin.role_changes', 'counter', 'Role changes'),
  m('Admin', 'admin.modules.toggled', 'counter', 'Portals turned on or off'),

  m('Email', 'email.sent', 'counter', 'Emails sent'),
  m('Email', 'email.failed', 'counter', 'Emails given up on'),
  m('Email', 'email.retries', 'counter', 'Emails retried'),

  m('Registration', 'registrations.started', 'counter', 'Registrations started'),
  m('Registration', 'registrations.submitted', 'counter', 'Registrations finished'),
  m('Registration', 'membership.reminders.sent', 'counter', 'Links sent to finish'),

  m('Membership', 'membership.people.added', 'counter', 'People added by hand'),
  m('Membership', 'membership.applications.submitted', 'counter', 'Applications entered'),
  m('Membership', 'membership.members.confirmed', 'counter', 'Members confirmed'),
  m('Membership', 'membership.attendance.marked', 'counter', 'Class sessions marked'),

  m('Finance', 'finance.transactions.created', 'counter', 'Entries recorded'),
  m('Finance', 'finance.transactions.voided', 'counter', 'Entries voided'),
  m('Finance', 'finance.transactions.replaced', 'counter', 'Entries moved to another month'),
  m('Finance', 'finance.catalog.created', 'counter', 'Items added'),
  m('Finance', 'finance.exports', 'counter', 'Downloads'),

  m('Change requests', 'change_requests.created', 'counter', 'Changes asked for'),
  m('Change requests', 'change_requests.applied', 'counter', 'Changes approved and applied'),
  m('Change requests', 'change_requests.rejected', 'counter', 'Changes rejected'),
  m('Change requests', 'change_requests.cancelled', 'counter', 'Changes withdrawn'),
  m('Change requests', 'change_requests.pending', 'gauge', 'Changes waiting'),

  m('Audit', 'audit.events', 'counter', 'Lines written to the activity log'),
];

/** The definition for a metric key, matching `*` tails. */
export function metricDef(key: string): MetricDef | undefined {
  return (
    USAGE_METRICS.find((d) => d.key === key) ??
    USAGE_METRICS.find((d) => d.key.endsWith('.*') && key.startsWith(d.key.slice(0, -1)))
  );
}

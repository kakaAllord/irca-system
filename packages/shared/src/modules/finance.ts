import { defineModule } from '../rbac/define';

/**
 * Money in and money out.
 *
 * Entries are never deleted and never edited directly: a correction, a void
 * included, is a request an administrator approves (D17). That is why there is
 * a permission to *ask* for a change and none to make one.
 */
export const financeModule = defineModule({
  key: 'finance',
  name: 'Finance',
  description: 'Income, expenses and reports.',
  kind: 'department',
  home: '/finance',
  permissions: {
    'finance.overview.read': { kind: 'read', label: 'See the finance overview' },
    'finance.transactions.read': { kind: 'read', label: 'See income and expense entries' },
    'finance.transactions.create': { kind: 'write', label: 'Record income and expenses' },
    'finance.transactions.request_change': {
      kind: 'write',
      label: 'Ask an administrator to correct or void an entry',
      hint: 'Entries are never changed directly. An administrator approves each change.',
    },
    'finance.transactions.export': { kind: 'read', label: 'Download entries as CSV' },
    'finance.catalog.read': { kind: 'read', label: 'See income sources and expense items' },
    'finance.catalog.create': {
      kind: 'write',
      label: 'Add a new income source or expense item while recording',
    },
    'finance.catalog.manage': {
      kind: 'write',
      label: 'Rename and turn off income sources and expense items',
    },
    'finance.reports.read': { kind: 'read', label: 'See reports and statements' },
    'finance.pledges.read': {
      kind: 'read',
      label: 'See pledge campaigns and their progress',
      hint: 'Totals and counts only. Who owes what needs the next permission.',
    },
    'finance.pledges.read_sensitive': {
      kind: 'read',
      label: 'See who pledged, and what each person still owes',
      hint: 'Names against amounts. The leadership gave this to the finance manager and the pastors.',
    },
    'finance.pledges.manage': {
      kind: 'write',
      label: 'Open campaigns, record pledges and cancel them',
    },
    'finance.pledges.record_payment': {
      kind: 'write',
      label: 'Record a payment towards a pledge, and ask for one to be corrected',
      hint: 'Finds the one person paying by name; does not open the list of who owes.',
    },
  },
  systemRoles: [
    {
      key: 'finance.viewer',
      name: 'Finance viewer',
      description: 'See the overview, entries and reports. Change nothing.',
      permissions: [
        'finance.overview.read',
        'finance.transactions.read',
        'finance.catalog.read',
        'finance.reports.read',
      ],
    },
    {
      key: 'finance.clerk',
      name: 'Finance clerk',
      description:
        'Everything a viewer can, plus record income and expenses, add new items while doing so, ask for corrections, and record payments towards pledges.',
      permissions: [
        'finance.overview.read',
        'finance.transactions.read',
        'finance.catalog.read',
        'finance.reports.read',
        'finance.transactions.create',
        'finance.transactions.request_change',
        'finance.catalog.create',
        'finance.pledges.read',
        'finance.pledges.record_payment',
      ],
    },
    {
      key: 'finance.manager',
      name: 'Finance manager',
      description:
        'Everything a clerk can, plus download entries, tidy the lists, and keep pledges: campaigns, who promised what, and what is left.',
      permissions: [
        'finance.overview.read',
        'finance.transactions.read',
        'finance.catalog.read',
        'finance.reports.read',
        'finance.transactions.create',
        'finance.transactions.request_change',
        'finance.catalog.create',
        'finance.transactions.export',
        'finance.catalog.manage',
        'finance.pledges.read',
        'finance.pledges.read_sensitive',
        'finance.pledges.manage',
        'finance.pledges.record_payment',
      ],
    },
    {
      key: 'finance.pledges_overseer',
      name: 'Pledges overseer',
      description:
        'For the pastors: every pledge, who made it and what is left, and nothing else in Finance. Changes nothing.',
      permissions: ['finance.pledges.read', 'finance.pledges.read_sensitive'],
    },
  ],
  nav: [
    { label: 'Overview', href: '/finance', icon: 'overview', permission: 'finance.overview.read' },
    {
      label: 'Transactions',
      href: '/finance/transactions',
      icon: 'transactions',
      permission: 'finance.transactions.read',
    },
    { label: 'Lists', href: '/finance/lists', icon: 'lists', permission: 'finance.catalog.read' },
    {
      label: 'Requests',
      href: '/finance/requests',
      icon: 'requests',
      permission: 'finance.transactions.read',
    },
    {
      label: 'Reports',
      href: '/finance/reports',
      icon: 'reports',
      permission: 'finance.reports.read',
    },
  ],
});

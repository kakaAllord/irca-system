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
        'Everything a viewer can, plus record income and expenses, add new items while doing so, and ask for corrections.',
      permissions: [
        'finance.overview.read',
        'finance.transactions.read',
        'finance.catalog.read',
        'finance.reports.read',
        'finance.transactions.create',
        'finance.transactions.request_change',
        'finance.catalog.create',
      ],
    },
    {
      key: 'finance.manager',
      name: 'Finance manager',
      description: 'Everything a clerk can, plus download entries and tidy the lists.',
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
      ],
    },
  ],
  nav: [
    { label: 'Overview', href: '/finance', mark: 'F', permission: 'finance.overview.read' },
    {
      label: 'Transactions',
      href: '/finance/transactions',
      mark: 'T',
      permission: 'finance.transactions.read',
    },
    { label: 'Lists', href: '/finance/lists', mark: 'L', permission: 'finance.catalog.read' },
    {
      label: 'Requests',
      href: '/finance/requests',
      mark: 'Q',
      permission: 'finance.transactions.read',
    },
    { label: 'Reports', href: '/finance/reports', mark: 'R', permission: 'finance.reports.read' },
  ],
});

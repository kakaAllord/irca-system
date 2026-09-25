import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MeResponse } from '@irca/shared';
import { Can, SessionProvider } from './session';

const me = (permissions: string[]): MeResponse => ({
  user: {
    id: '1',
    email: 'a@b.co',
    fullName: 'Neema Mollel',
    initials: 'NM',
  },
  church: null,
  permissions,
  modules: [],
  roleLabels: [],
  badges: {},
  impersonation: null,
});

describe('Can', () => {
  it('shows what the person may do and hides the rest', () => {
    render(
      <SessionProvider me={me(['finance.transactions.read'])}>
        <Can permission="finance.transactions.read">See entries</Can>
        <Can permission="finance.transactions.create">Record an entry</Can>
      </SessionProvider>,
    );
    expect(screen.getByText('See entries')).toBeDefined();
    expect(screen.queryByText('Record an entry')).toBeNull();
  });

  it('hides every action at once while someone is being viewed as, because only read permissions arrive', () => {
    // This is how impersonation stays read-only without any page knowing:
    // the API sends no write permissions at all.
    render(
      <SessionProvider me={me(['finance.transactions.read'])}>
        <Can permission="finance.transactions.create">Record an entry</Can>
        <Can permission="admin.users.invite">Invite someone</Can>
      </SessionProvider>,
    );
    expect(screen.queryByText('Record an entry')).toBeNull();
    expect(screen.queryByText('Invite someone')).toBeNull();
  });

  it('can show something else instead', () => {
    render(
      <SessionProvider me={me([])}>
        <Can permission="finance.catalog.create" fallback={<span>Ask a finance manager</span>}>
          Create it
        </Can>
      </SessionProvider>,
    );
    expect(screen.getByText('Ask a finance manager')).toBeDefined();
  });
});

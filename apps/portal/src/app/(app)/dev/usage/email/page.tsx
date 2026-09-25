import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { Figure } from '@/modules/dev/components/Figure';
import { ago, daysAgo, number, total, type SentEmail, type Series } from '@/modules/dev/types';

export const metadata: Metadata = { title: 'Email' };

const TONE = {
  SENT: 'positive',
  PENDING: 'muted',
  SENDING: 'accent',
  FAILED: 'danger',
} as const;

/** Did it go? The answer to most "I never got the invitation" questions. */
export default async function EmailPage() {
  const [series, emails] = await Promise.all([
    serverApi<Series[]>(
      `/dev/usage?metrics=email.sent,email.failed,email.retries&from=${daysAgo(29)}`,
    ),
    serverApi<SentEmail[]>('/dev/usage/emails'),
  ]);
  const failed = total(series, 'email.failed');

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Sent, 30 days" value={number(total(series, 'email.sent'))} />
        <Figure
          label="Tried again"
          value={number(total(series, 'email.retries'))}
          note="the provider was busy, then took it"
        />
        <Figure
          label="Given up on"
          value={number(failed)}
          tone={failed > 0 ? 'bad' : 'fine'}
          note={
            emails.some((e) => e.status === 'FAILED')
              ? 'the reason is on its row below'
              : failed > 0
                ? 'longer ago than the last 50 below'
                : undefined
          }
        />
      </div>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold text-fg">The last 50</h2>
        {!emails.length && <p className="text-[12.5px] text-fg3">No email has been sent yet.</p>}
        {emails.length > 0 && (
          <Table head={['To', 'What', 'Queued', 'Sent', 'Tries', '']}>
            {emails.map((email) => (
              <Row key={email.id}>
                <Cell nowrap>
                  <span className="font-mono text-[11.5px] text-fg">{email.to}</span>
                </Cell>
                <Cell>
                  <span className="text-fg2">{email.template.replace(/-/g, ' ')}</span>
                  {email.lastError && (
                    <p className="mt-0.5 text-[11.5px] text-danger">{email.lastError}</p>
                  )}
                </Cell>
                <Cell nowrap>
                  <span className="text-fg2">{ago(email.createdAt)}</span>
                </Cell>
                <Cell nowrap>
                  <span className="text-fg2">{email.sentAt ? ago(email.sentAt) : '—'}</span>
                </Cell>
                <Cell nowrap>
                  <span className="tabular-nums text-fg3">{email.attempts}</span>
                </Cell>
                <Cell nowrap>
                  <Badge tone={TONE[email.status]}>{email.status.toLowerCase()}</Badge>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
        <p className="mt-2 text-[11.5px] text-fg3">
          Addresses are cut short before they leave the server. The full address is on the
          person&apos;s own page, in Admin or Membership, for those allowed to see it.
        </p>
      </section>
    </div>
  );
}

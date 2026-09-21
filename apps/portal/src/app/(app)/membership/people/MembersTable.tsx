'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clientApi } from '@/lib/api/client';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Table, Row, Cell } from '@/components/ui/Table';
import { SpiritualPills } from '@/modules/membership/components/SpiritualPills';
import { EnrollDrawer } from '@/modules/membership/components/EnrollDrawer';
import { RemindMenu } from '@/modules/membership/components/RemindMenu';
import { STAGE_LABEL, day, type PersonDetail, type PersonRow } from '@/modules/membership/types';

/**
 * The Members table. A row opens in place, as in the design, and what it
 * shows is fetched then: the record comes from the API with the private parts
 * already left out for anyone who may not read them, so this page never holds
 * a prayer request it should not.
 */
export function MembersTable({ rows }: { rows: PersonRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Table head={['Member', 'Phone', 'Registered', 'Age', 'Interested in', 'Heard via', '']}>
      {rows.map((person) => (
        <MemberRows
          key={person.id}
          person={person}
          shown={open === person.id}
          onToggle={() => setOpen(open === person.id ? null : person.id)}
        />
      ))}
    </Table>
  );
}

function MemberRows({
  person,
  shown,
  onToggle,
}: {
  person: PersonRow;
  shown: boolean;
  onToggle: () => void;
}) {
  const flags = [
    person.saved.value && 'Saved',
    person.baptised.value && 'Baptised',
    !person.complete &&
      `Incomplete${person.progress ? ` · ${person.progress.answered} of ${person.progress.of}` : ''}`,
  ].filter(Boolean);

  return (
    <>
      <Row onClick={onToggle}>
        <Cell>
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-7 flex-none items-center justify-center rounded-full bg-chip text-[11px] font-semibold text-fg2"
            >
              {person.initials}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-medium text-fg">
                {person.fullName || <span className="text-fg3">Unknown</span>}
              </span>
              {flags.length > 0 && (
                <span className="text-[11px] text-fg3">{flags.join(' · ')}</span>
              )}
            </span>
          </span>
        </Cell>
        <Cell nowrap>
          <span className="tabular-nums text-fg2">{person.phone || '—'}</span>
        </Cell>
        <Cell nowrap>
          <span className="text-fg2">{day(person.registeredAt)}</span>
        </Cell>
        <Cell nowrap>
          <span className="text-fg2">{person.ageGroup || '—'}</span>
        </Cell>
        <Cell>
          <span className="text-fg2">{person.interestedIn.join(', ') || '—'}</span>
        </Cell>
        <Cell>
          <span className="text-fg2">{person.heardVia.join(', ') || '—'}</span>
        </Cell>
        <Cell nowrap>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={shown}
            aria-label={
              shown
                ? `Close ${person.fullName || 'this person'}`
                : `Open ${person.fullName || 'this person'}`
            }
            className="px-1 text-fg3 hover:text-fg"
          >
            {shown ? '⌄' : '›'}
          </button>
        </Cell>
      </Row>
      {shown && (
        <tr className="border-t border-border2 bg-surface2">
          <Cell colSpan={7}>
            <Expanded id={person.id} />
          </Cell>
        </tr>
      )}
    </>
  );
}

function Expanded({ id }: { id: string }) {
  const [person, setPerson] = useState<PersonDetail | null>(null);

  useEffect(() => {
    clientApi<PersonDetail>(`/membership/people/${id}`)
      .then(setPerson)
      .catch(() => setPerson(null));
  }, [id]);

  if (!person) {
    return (
      <div className="flex items-center gap-2 py-2 text-[12px] text-fg3">
        <Spinner /> Opening…
      </div>
    );
  }

  const fact = (label: string, value: string) => (
    <div className="flex flex-col">
      <span className="text-[10.5px] font-semibold tracking-wide text-fg3 uppercase">{label}</span>
      <span className="text-[12.5px] text-fg">{value || '—'}</span>
    </div>
  );

  return (
    <div className="grid gap-5 py-2 md:grid-cols-3">
      <section className="flex flex-col gap-2.5">
        <h3 className="text-[12px] font-semibold text-fg">Registration</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {person.sensitive && fact('Email', person.sensitive.email)}
          {fact('Gender', person.gender)}
          {fact('Lives in', person.livesIn)}
          {fact(
            'Occupation',
            [person.occupation.kind, person.occupation.detail].filter(Boolean).join(' · '),
          )}
          {fact('First visit', person.visit.join(', '))}
          {fact('Heard via', person.heardVia.join(', '))}
        </div>
        {!person.complete && (
          <div className="flex items-center gap-2">
            <Badge tone="accent">Did not finish</Badge>
            <RemindMenu personId={person.id} label="Send their link" />
          </div>
        )}
      </section>

      {/* Absent, not hidden, for anyone who may not read it. */}
      {person.sensitive && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold text-fg">Prayer request</h3>
          <p className="text-[12.5px] whitespace-pre-line text-fg2">
            {person.sensitive.prayer || 'None given.'}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h3 className="text-[12px] font-semibold text-fg">Spiritual status</h3>
        <SpiritualPills
          personId={person.id}
          saved={person.saved}
          baptised={person.baptised}
          savedBy={person.savedBy}
          baptisedBy={person.baptisedBy}
        />
        <p className="text-[12px] text-fg2">Stage: {STAGE_LABEL[person.stage]}</p>
        <div className="flex flex-wrap gap-2">
          {(person.stage === 'VISITOR' || person.stage === 'NEW_CONVERT') && (
            <EnrollDrawer personId={person.id} name={person.fullName} />
          )}
          <Link
            href={`/membership/people/${person.id}`}
            className="inline-flex h-7 items-center rounded-[7px] px-2.5 text-[11.5px] font-medium text-accent hover:bg-hover"
          >
            Open full record →
          </Link>
        </div>
      </section>
    </div>
  );
}

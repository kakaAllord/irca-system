import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { SpiritualPills } from '@/modules/membership/components/SpiritualPills';
import { NoteDrawer } from '@/modules/membership/components/NoteDrawer';
import { RemindMenu } from '@/modules/membership/components/RemindMenu';
import { EnrollDrawer } from '@/modules/membership/components/EnrollDrawer';
import { STAGE_LABEL, day, when, type PersonDetail } from '@/modules/membership/types';
import { StageActions } from './StageActions';
import { MessagingSettings } from '@/modules/membership/components/MessagingSettings';

export const metadata: Metadata = { title: 'Person' };

/**
 * One person, in full: who they are, what they told us, where they are on the
 * journey and how they got there, and what the church has done since.
 */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'membership.people.read')) return <ForbiddenState what="this person's record" />;

  const { id } = await params;
  const person = await serverApi<PersonDetail>(`/membership/people/${id}`);
  const s = person.sensitive;

  const fact = (label: string, value: string | null | undefined) => (
    <>
      <dt className="text-fg3">{label}</dt>
      <dd className="text-fg">{value || '—'}</dd>
    </>
  );
  const yesNo = (v: boolean | null) => (v === null ? '—' : v ? 'Yes' : 'No');

  return (
    <div className="max-w-4xl">
      <Link href="/membership/people" className="text-[12px] text-fg3 hover:text-fg">
        ← Members
      </Link>
      <PageHeader
        title={person.fullName || 'Unknown'}
        subtitle={`${STAGE_LABEL[person.stage]}${person.memberNumber ? ` · member no. ${person.memberNumber}` : ''} · registered ${day(person.registeredAt)}`}
        actions={
          <>
            {!person.complete && <RemindMenu personId={person.id} label="Send their link" />}
            <NoteDrawer
              personId={person.id}
              name={person.fullName}
              kind="NOTE"
              label="Add note"
              size="md"
            />
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-fg">
            About them
            {person.hasRegistration && (
              <span className="ml-2 font-normal text-fg3">· from the registration form</span>
            )}
          </h2>
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[12.5px]">
            {fact('Phone', person.phone)}
            {s && fact('Email', s.email)}
            {fact('Gender', person.gender)}
            {fact('Age group', person.ageGroup)}
            {s && fact('Date of birth', s.dob)}
            {fact('Lives in', person.livesIn)}
            {fact(
              'Occupation',
              [person.occupation.kind, person.occupation.detail].filter(Boolean).join(' · '),
            )}
            {fact('Came for', person.visit.join(', '))}
            {fact('Heard via', person.heardVia.join(', '))}
            {fact('Interested in', person.interestedIn.join(', '))}
          </dl>
          {!person.complete && (
            <p className="mt-3 text-[12px] text-fg3">
              <Badge tone="accent">Did not finish</Badge>{' '}
              {person.progress && `${person.progress.answered} of ${person.progress.of} answered`}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4">
          <h2 className="text-[13px] font-semibold text-fg">Where they are</h2>
          <SpiritualPills
            personId={person.id}
            saved={person.saved}
            baptised={person.baptised}
            savedBy={person.savedBy}
            baptisedBy={person.baptisedBy}
          />
          <StageActions personId={person.id} stage={person.stage} />
          {(person.stage === 'VISITOR' || person.stage === 'NEW_CONVERT') && (
            <div>
              <EnrollDrawer personId={person.id} name={person.fullName} />
            </div>
          )}
          <MessagingSettings
            personId={person.id}
            lang={person.messaging.lang}
            optOut={person.messaging.optOut}
            optOutSource={person.messaging.optOutSource}
          />
          <ol className="mt-1 flex flex-col gap-1 border-t border-border2 pt-3 text-[12px]">
            {person.history.length === 0 && <li className="text-fg3">No moves yet.</li>}
            {person.history.map((event, i) => (
              <li key={i} className="flex flex-wrap gap-1.5">
                <span className="text-fg3">{when(event.at)}</span>
                <span className="text-fg2">
                  {event.from ? `${STAGE_LABEL[event.from]} → ` : ''}
                  {STAGE_LABEL[event.to]} · {event.by}
                  {event.note && ` — ${event.note}`}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* The private half of the record: absent for anyone who may not read it. */}
        {s && (
          <>
            <section className="rounded-[10px] border border-border bg-surface p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-fg">Faith and family</h2>
              <dl className="grid grid-cols-[150px_1fr] gap-y-1.5 text-[12.5px]">
                {fact(
                  'Saved',
                  `${yesNo(s.faith.saved)}${s.faith.savedYear ? `, ${s.faith.savedYear}` : ''}`,
                )}
                {fact(
                  'Baptised',
                  `${yesNo(s.faith.baptised)}${s.faith.baptisedYear ? `, ${s.faith.baptisedYear}` : ''}`,
                )}
                {fact('Holy Spirit', yesNo(s.faith.holySpirit))}
                {fact('Previous church', s.faith.previousChurch)}
                {fact(
                  'Marital status',
                  `${s.family.marital}${s.family.marriedYear ? `, since ${s.family.marriedYear}` : ''}`,
                )}
                {fact('Children', s.family.children.join(', '))}
                {fact('Would like to serve', s.ministries.join(', '))}
                {fact('What they liked', s.liked)}
              </dl>
            </section>
            <section className="rounded-[10px] border border-border bg-surface p-4">
              <h2 className="mb-2 text-[13px] font-semibold text-fg">Prayer request</h2>
              <p className="text-[12.5px] whitespace-pre-line text-fg2">
                {s.prayer || 'None given.'}
              </p>
            </section>
          </>
        )}

        {person.notes && (
          <section className="rounded-[10px] border border-border bg-surface p-4 md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-fg">Visits, calls and notes</h2>
              <div className="flex gap-2">
                <NoteDrawer
                  personId={person.id}
                  name={person.fullName}
                  kind="VISIT"
                  label="Log visit"
                />
                <NoteDrawer
                  personId={person.id}
                  name={person.fullName}
                  kind="CALL"
                  label="Log call"
                />
              </div>
            </div>
            <ol className="flex flex-col gap-2 text-[12.5px]">
              {person.notes.length === 0 && <li className="text-fg3">Nothing written down yet.</li>}
              {person.notes.map((note) => (
                <li
                  key={note.id}
                  className="border-t border-border2 pt-2 first:border-0 first:pt-0"
                >
                  <p className="text-[11.5px] text-fg3">
                    {note.kind === 'VISIT' ? 'Visit' : note.kind === 'CALL' ? 'Call' : 'Note'} ·{' '}
                    {note.by} · {when(note.at)}
                  </p>
                  <p className="whitespace-pre-line text-fg2">{note.body}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

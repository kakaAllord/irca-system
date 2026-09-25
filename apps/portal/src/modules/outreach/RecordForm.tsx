'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DIAL_CODES } from '@irca/shared/registration';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';

export type TeamChoice = {
  id: string;
  sessionId: string;
  label: string;
  area: string;
  people: string[];
};
type Candidate = { personId: string; name: string; last: string };

const LANGS = [
  { value: '', label: 'The church’s usual language' },
  { value: 'sw', label: 'Kiswahili' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
];

/**
 * Recording someone reached, standing on a doorstep (08 step 8.5).
 *
 * Four things: the name, the phone, where, and who reached them. The team
 * brings the last two, so on a Saturday three are typed — the name, the
 * number and the consent tick — and everything else is folded away. After
 * saving, the form clears and keeps the team, ready for the next person.
 *
 * When the number, or with no number the name, belongs to someone already
 * known, nothing is saved yet: the recorder is asked whether it is them.
 */
export function RecordForm({
  teams,
  defaultTeamId,
  people,
  areas,
}: {
  teams: TeamChoice[];
  defaultTeamId: string | null;
  /** The Outreach team, for someone reached away from a Saturday team. */
  people: { personId: string; name: string }[];
  areas: string[];
}) {
  const router = useRouter();
  const listId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? '');
  const team = teams.find((t) => t.id === teamId) ?? null;
  const [fullName, setFullName] = useState('');
  const [dial, setDial] = useState('+255');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [by, setBy] = useState<string[]>([]);
  const [mayMessage, setMayMessage] = useState(false);
  const [needsFollowUp, setNeedsFollowUp] = useState(true);
  const [lang, setLang] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  async function save(answer: { samePersonId?: string; notSamePerson?: boolean } = {}) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await clientApi('/outreach/reached', {
        method: 'POST',
        body: {
          teamId: team?.id ?? null,
          sessionId: team?.sessionId ?? null,
          fullName,
          dial,
          phone,
          ...(area.trim() ? { area } : {}),
          ...(team ? {} : { reachedByIds: by }),
          ...(lang ? { lang } : {}),
          mayMessage,
          needsFollowUp,
          ...(note.trim() ? { note } : {}),
          ...answer,
        },
      });
      setSaved(fullName.trim());
      setCandidates(null);
      setFullName('');
      setPhone('');
      setMayMessage(false);
      setNeedsFollowUp(true);
      setNote('');
      if (team) setArea('');
      router.refresh();
      nameRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'POSSIBLE_MATCH') {
        setCandidates((err.details as { candidates: Candidate[] }).candidates);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  }

  const missing = fullName.trim().length < 2 ? ['Name'] : [];

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!missing.length && !busy) void save();
      }}
    >
      {saved && <Alert>Saved {saved}. Ready for the next one.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Select
        label="Team"
        value={teamId}
        onChange={(e) => {
          setTeamId(e.target.value);
          setArea('');
        }}
        options={[
          ...teams.map((t) => ({ value: t.id, label: t.label })),
          { value: '', label: 'No team: reached another day' },
        ]}
      />
      {team && (
        <p className="-mt-2 text-[12px] text-fg3">
          {team.area}, by {team.people.join(', ')}
        </p>
      )}

      <Input
        ref={nameRef}
        label="Name"
        required
        autoComplete="off"
        autoCapitalize="words"
        maxLength={120}
        value={fullName}
        onChange={(e) => {
          setFullName(e.target.value);
          setCandidates(null);
        }}
      />

      <div className="flex items-end gap-2">
        <div className="w-24 flex-none">
          <Select
            label="Code"
            value={dial}
            onChange={(e) => setDial(e.target.value)}
            options={DIAL_CODES.map((d) => ({ value: d.dial, label: `${d.dial} ${d.cc}` })).filter(
              (o, i, all) => all.findIndex((x) => x.value === o.value) === i,
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Input
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="0712 345 678"
            maxLength={20}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setCandidates(null);
            }}
          />
        </div>
      </div>

      {!team && (
        <>
          <Input
            label="Area"
            list={listId}
            maxLength={80}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
          <datalist id={listId}>
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[12px] font-medium text-fg2">Who reached them</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {people.map((p) => (
                <label key={p.personId} className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={by.includes(p.personId)}
                    onChange={(e) =>
                      setBy((all) =>
                        e.target.checked
                          ? [...all, p.personId]
                          : all.filter((id) => id !== p.personId),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <label className="flex items-start gap-2.5 rounded-[8px] border border-border p-3 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 size-4"
          checked={mayMessage}
          onChange={(e) => setMayMessage(e.target.checked)}
        />
        <span>
          <span className="font-medium text-fg">May the church send them messages?</span>
          <span className="block text-[11.5px] text-fg3">
            Ask them first. Left unticked, the church never texts them.
          </span>
        </span>
      </label>

      <details className="text-[12.5px]">
        <summary className="cursor-pointer text-fg2">More: area, language, a note</summary>
        <div className="mt-3 flex flex-col gap-3">
          {team && (
            <Input
              label="Area"
              list={listId}
              maxLength={80}
              placeholder={team.area}
              hint="Only when it was not the team's area."
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          )}
          {team && (
            <datalist id={listId}>
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          )}
          <Select
            label="Language"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            options={LANGS}
          />
          <Input
            label="Note"
            maxLength={1000}
            hint="Read by everyone who can see them, in Outreach and in Membership."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={needsFollowUp}
              onChange={(e) => setNeedsFollowUp(e.target.checked)}
            />
            Needs following up
          </label>
        </div>
      </details>

      {candidates ? (
        <div
          role="alert"
          className="flex flex-col gap-2.5 rounded-[10px] border border-warn-br bg-warn-bg p-3"
        >
          <p className="text-[13px] font-medium text-warn-fg">Someone we already know?</p>
          {candidates.map((c) => (
            <div key={c.personId} className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-fg">
                {c.name}
                <span className="text-fg2">, {c.last}</span>
              </span>
              <Button
                size="sm"
                className="flex-none"
                loading={busy}
                onClick={() => void save({ samePersonId: c.personId })}
              >
                Same person
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => void save({ notSamePerson: true })}
          >
            Someone else: save {fullName.trim() || 'them'} as new
          </Button>
        </div>
      ) : (
        <SubmitButton type="submit" loading={busy} missing={missing} className="h-11 w-full">
          Save
        </SubmitButton>
      )}
    </form>
  );
}

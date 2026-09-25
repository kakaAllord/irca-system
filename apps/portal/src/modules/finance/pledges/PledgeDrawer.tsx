'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLEDGE_RHYTHMS, type PledgeRhythm } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { PersonSearch } from '@/modules/departments/PersonSearch';
import { STAGE_LABEL, type Stage } from '@/modules/membership/types';

type Candidate = { personId: string; name: string; stage: Stage; phoneTail: string };

/**
 * Recording a promise: who, how much, and — if they said — how and by when
 * they will pay. Anyone in People can pledge; someone not there yet is added
 * to People first.
 */
export function PledgeDrawer({
  campaign,
  timezone,
}: {
  campaign: { id: string; name: string };
  timezone: string;
}) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<Candidate | null>(null);
  const [amount, setAmount] = useState('');
  const [rhythm, setRhythm] = useState<PledgeRhythm>('ONE_OFF');
  const [promisedOn, setPromisedOn] = useState(today);
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');
  // One per opening of the drawer: a double-press saves one pledge.
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setPerson(null);
    setAmount('');
    setRhythm('ONE_OFF');
    setPromisedOn(today);
    setDueOn('');
    setNote('');
    setError(null);
    setClientRequestId(crypto.randomUUID());
    setOpen(true);
  }

  async function save() {
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      await clientApi('/finance/pledges', {
        method: 'POST',
        body: {
          campaignId: campaign.id,
          personId: person.personId,
          amount,
          rhythm,
          promisedOn,
          dueOn: dueOn || null,
          note,
          clientRequestId,
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    !person && 'Who',
    !amount.trim() && 'Amount',
    !promisedOn && 'Promised on',
  ].filter(Boolean) as string[];

  return (
    <>
      <Button onClick={start}>+ Record a pledge</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`A pledge towards ${campaign.name}`}
        description="What someone promised. Payments are recorded against it as they come in."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              Record it
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <PersonSearch<Candidate>
            label="Who"
            endpoint="/finance/pledges/person-candidates"
            describe={(c) =>
              [STAGE_LABEL[c.stage], c.phoneTail && `phone ${c.phoneTail}`]
                .filter(Boolean)
                .join(' · ')
            }
            chosen={person}
            onChoose={setPerson}
            emptyHint="Nobody in People by that name or number. Add them in Membership first."
          />
          <Input
            label="Amount promised"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="200,000"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="How they will pay"
              value={rhythm}
              onChange={(e) => setRhythm(e.target.value as PledgeRhythm)}
              options={Object.entries(PLEDGE_RHYTHMS).map(([value, label]) => ({ value, label }))}
            />
            <Input
              label="Promised on"
              type="date"
              required
              max={today}
              value={promisedOn}
              onChange={(e) => setPromisedOn(e.target.value)}
            />
            <Input
              label="Paid by (optional)"
              type="date"
              min={promisedOn}
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              hint="After this date an unpaid pledge shows as overdue."
            />
          </div>
          <Input
            label="Note (optional)"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Said they would bring it after harvest"
          />
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Drawer>
    </>
  );
}

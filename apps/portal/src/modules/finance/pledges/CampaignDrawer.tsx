'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PledgeCampaignView } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * Opening a campaign, or changing one: its name, a target if there is one,
 * and when it runs. Closing it stops new pledges; what was promised can still
 * be paid.
 */
export function CampaignDrawer({
  campaign,
  timezone,
}: {
  campaign?: PledgeCampaignView;
  timezone: string;
}) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(campaign?.name ?? '');
  const [target, setTarget] = useState(campaign?.targetAmount ?? '');
  const [startsOn, setStartsOn] = useState(campaign?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? '');
  const [isActive, setIsActive] = useState(campaign?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      name,
      targetAmount: target.trim() ? target : null,
      startsOn,
      endsOn: endsOn || null,
      ...(campaign ? { isActive } : {}),
    };
    try {
      if (campaign) {
        await clientApi(`/finance/pledge-campaigns/${campaign.id}`, { method: 'PATCH', body });
      } else {
        const made = await clientApi<{ id: string }>('/finance/pledge-campaigns', {
          method: 'POST',
          body,
        });
        router.push(`/finance/pledges/${made.id}`);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const missing = [name.trim().length < 2 && 'Name', !startsOn && 'Starts on'].filter(
    Boolean,
  ) as string[];

  return (
    <>
      <Button variant={campaign ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
        {campaign ? 'Change' : '+ New campaign'}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={campaign ? `Change "${campaign.name}"` : 'A new campaign'}
        description="Something the church is raising for. People's pledges are recorded against it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              {campaign ? 'Save' : 'Open it'}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ujenzi 2027"
          />
          <Input
            label="Target (optional)"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="50,000,000"
            hint="What the church hopes to raise. Leave it empty if there is no figure."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Starts on"
              type="date"
              required
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
            <Input
              label="Ends on (optional)"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>
          {campaign && (
            <label className="flex items-start gap-2 text-[12.5px] text-fg">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>
                Taking new pledges
                <span className="block text-[11.5px] text-fg3">
                  Untick to close it. Pledges already made can still be paid.
                </span>
              </span>
            </label>
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Drawer>
    </>
  );
}

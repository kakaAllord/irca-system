'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { LANG_LABEL } from './types';

export type CommsSettings = {
  pricePerSegment: string;
  dailyCap: string | null;
  defaultLang: 'en' | 'sw' | 'fr';
  quietHours: string;
  beem: {
    saved: boolean;
    senderId: string | null;
    keyHint: string | null;
    updatedAt: string | null;
    canSave: boolean;
    live: boolean;
  };
};

/** The price, the daily limit, quiet hours and the default language. */
export function SettingsForm({ settings }: { settings: CommsSettings }) {
  const router = useRouter();
  const [price, setPrice] = useState(settings.pricePerSegment);
  const [cap, setCap] = useState(settings.dailyCap ?? '');
  const [lang, setLang] = useState(settings.defaultLang);
  const [from, to] = settings.quietHours.split('-');
  const [quietFrom, setQuietFrom] = useState(from ?? '21:00');
  const [quietTo, setQuietTo] = useState(to ?? '07:00');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    setErrors({});
    try {
      await clientApi('/comms/settings', {
        method: 'PUT',
        body: {
          pricePerSegment: price,
          dailyCap: cap.trim() || null,
          defaultLang: lang,
          quietHours: `${quietFrom}-${quietTo}`,
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.fieldErrors);
        setError(err.message);
      } else setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Price per segment (TZS)"
          required
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          hint="From Beem's price list."
          error={errors.pricePerSegment?.[0]}
        />
        <Input
          label="Daily limit (TZS)"
          inputMode="decimal"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          hint="Empty for no limit. A send that would pass a limit is refused."
          error={errors.dailyCap?.[0]}
        />
        <Input
          label="Quiet from"
          type="time"
          required
          value={quietFrom}
          onChange={(e) => setQuietFrom(e.target.value)}
          hint="Recurring messages wait until it ends."
        />
        <Input
          label="Quiet until"
          type="time"
          required
          value={quietTo}
          onChange={(e) => setQuietTo(e.target.value)}
        />
        <Select
          label="Default language"
          value={lang}
          onChange={(e) => setLang(e.target.value as CommsSettings['defaultLang'])}
          options={(['sw', 'en', 'fr'] as const).map((l) => ({ value: l, label: LANG_LABEL[l] }))}
        />
      </div>
      {saved && <Alert>Saved.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <SubmitButton
          loading={busy}
          missing={price.trim() ? [] : ['Price per segment']}
          onClick={save}
        >
          Save
        </SubmitButton>
      </div>
    </div>
  );
}

/**
 * The Beem account (D26). The key and secret are typed here and never shown
 * again: only the key's last four characters come back. Leave them empty to
 * keep the ones saved and change only the sender name.
 */
export function BeemForm({ beem }: { beem: CommsSettings['beem'] }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [senderId, setSenderId] = useState(beem.senderId ?? '');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function save() {
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      await clientApi('/comms/settings/beem', {
        method: 'PUT',
        body: { senderId, ...(apiKey ? { apiKey } : {}), ...(secretKey ? { secretKey } : {}) },
      });
      setApiKey('');
      setSecretKey('');
      setMessage({ tone: 'info', text: 'Saved. Test it to be sure.' });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.fieldErrors);
        setMessage({ tone: 'error', text: err.message });
      } else setMessage({ tone: 'error', text: 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await clientApi<{ ok: boolean; credit?: string | null; error?: string }>(
        '/comms/settings/beem/test',
        { method: 'POST' },
      );
      setMessage(
        res.ok
          ? {
              tone: 'info',
              text: `Beem answered.${res.credit ? ` Credit left: ${Number(res.credit).toLocaleString('en-GB')} TZS.` : ''}`,
            }
          : { tone: 'error', text: res.error ?? 'Beem did not answer.' },
      );
    } finally {
      setTesting(false);
    }
  }

  const missing = [
    !senderId.trim() && 'Sender name',
    !beem.saved && !apiKey.trim() && 'Key',
    !beem.saved && !secretKey.trim() && 'Secret',
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4">
      {!beem.canSave && (
        <Alert tone="warn">
          The server cannot keep a Beem key safely yet: whoever runs it must set BEEM_SETTINGS_KEY.
          Until then messages are only written to its log.
        </Alert>
      )}
      {beem.saved && !beem.live && (
        <Alert tone="warn">
          This server writes messages to its log instead of sending them (SMS_LIVE is not on). Test
          connection still asks Beem for the credit.
        </Alert>
      )}
      <p className="text-[12.5px] text-fg2">
        {beem.saved
          ? `A key ending ${beem.keyHint} is saved${beem.updatedAt ? `, since ${new Date(beem.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.${beem.live ? ' Messages go through Beem.' : ''}`
          : 'No Beem account yet: messages are only written to the server log.'}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordInput
          label={beem.saved ? 'New key (leave empty to keep it)' : 'Key'}
          required={!beem.saved}
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          error={errors.apiKey?.[0]}
        />
        <PasswordInput
          label={beem.saved ? 'New secret (leave empty to keep it)' : 'Secret'}
          required={!beem.saved}
          autoComplete="off"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          error={errors.secretKey?.[0]}
        />
        <Input
          label="Sender name"
          required
          maxLength={11}
          value={senderId}
          onChange={(e) => setSenderId(e.target.value)}
          hint="Exactly as Beem registered it, at most 11 characters."
          error={errors.senderId?.[0]}
        />
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton loading={busy} missing={missing} disabled={!beem.canSave} onClick={save}>
          Save
        </SubmitButton>
        {beem.saved && (
          <Button variant="secondary" loading={testing} onClick={test}>
            Test connection
          </Button>
        )}
      </div>
    </div>
  );
}

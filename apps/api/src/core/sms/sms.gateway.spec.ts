import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { PrismaDb } from '../database/prisma-clients.js';
import { LogSmsProvider } from './providers/log.provider.js';
import { MemorySmsProvider } from './providers/memory.provider.js';
import { seal } from './secret-box.js';
import { SmsGateway } from './sms.gateway.js';

const KEY = randomBytes(32);

/** A gateway on a pretend database holding a saved Beem account, in this environment. */
function gateway(env: Record<string, string | undefined>, key: Buffer = KEY) {
  const account = {
    id: 1,
    apiKeyEnc: seal('beem-key', key),
    secretKeyEnc: seal('beem-secret', key),
    keyLast4: '-key',
    senderId: 'IRCA',
    updatedAt: new Date(),
    updatedById: null,
  };
  const db = { commsBeemAccount: { findUnique: async () => account } } as unknown as PrismaDb;
  const config = {
    get: (k: string) => ({ BEEM_SETTINGS_KEY: KEY.toString('base64'), ...env })[k],
  } as unknown as AppConfig;
  return new SmsGateway(db, config, new MemorySmsProvider(), new LogSmsProvider());
}

describe('which way a text goes', () => {
  it('never texts anyone from a development machine, even with a Beem key saved', async () => {
    const { provider, senderId } = await gateway({ NODE_ENV: 'development' }).current();
    expect(provider.name).toBe('log');
    expect(senderId).toBe('IRCA');
    expect((await gateway({ NODE_ENV: 'development' }).summary()).live).toBe(false);
  });

  it('sends through Beem in development only when SMS_LIVE=true says so', async () => {
    const { provider } = await gateway({ NODE_ENV: 'development', SMS_LIVE: 'true' }).current();
    expect(provider.name).toBe('beem');
  });

  it('sends through Beem in production, unless SMS_LIVE=false', async () => {
    expect((await gateway({ NODE_ENV: 'production' }).current()).provider.name).toBe('beem');
    expect(
      (await gateway({ NODE_ENV: 'production', SMS_LIVE: 'false' }).current()).provider.name,
    ).toBe('log');
  });

  it('keeps to the log when the saved key was sealed with a different BEEM_SETTINGS_KEY', async () => {
    const { provider } = await gateway({ NODE_ENV: 'production' }, randomBytes(32)).current();
    expect(provider.name).toBe('log');
  });
});

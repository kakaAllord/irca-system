import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { PrismaDb } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import { BeemSmsProvider } from './providers/beem.provider.js';
import { LogSmsProvider } from './providers/log.provider.js';
import { MemorySmsProvider } from './providers/memory.provider.js';
import { open, seal } from './secret-box.js';
import type { SmsProvider } from './sms.types.js';

/** What a sender name may be, as Beem registers them: 11 letters, digits or spaces. */
const SENDER_ID = /^[A-Za-z0-9 ]{1,11}$/;
/** Used when no Beem account is saved, so the log still says who it was from. */
const NO_SENDER = 'IRCA';

export type BeemAccountSummary = {
  saved: boolean;
  senderId: string | null;
  /** '…1a2b': enough to tell which key is saved. Never more. */
  keyHint: string | null;
  updatedAt: string | null;
  /** Whether BEEM_SETTINGS_KEY is set, without which none of this can be saved. */
  canSave: boolean;
};

/**
 * Which way a text goes, decided every time one is sent.
 *
 * Tests always get memory. Otherwise Beem, as soon as Communications has
 * saved an account (and the API can open it); until then, the log, so a
 * development machine or a fresh deployment never texts anyone. The account
 * is read on every use, not once at start-up, because Communications may
 * change the key at any moment (D26).
 *
 * The key and secret are sealed with BEEM_SETTINGS_KEY before they are
 * written, and nothing here ever hands them back to anyone.
 */
@Injectable()
export class SmsGateway {
  constructor(
    private readonly db: PrismaDb,
    private readonly config: AppConfig,
    private readonly memory: MemorySmsProvider,
    private readonly log: LogSmsProvider,
  ) {}

  /** The provider to use now, and the sender name to use with it. */
  async current(): Promise<{ provider: SmsProvider; senderId: string }> {
    if (this.config.get('NODE_ENV') === 'test') {
      const account = await this.db.commsBeemAccount.findUnique({ where: { id: 1 } });
      return { provider: this.memory, senderId: account?.senderId ?? NO_SENDER };
    }
    const opened = await this.openAccount();
    if (opened)
      return {
        provider: new BeemSmsProvider(opened.key, opened.secret),
        senderId: opened.senderId,
      };
    return { provider: this.log, senderId: NO_SENDER };
  }

  async summary(): Promise<BeemAccountSummary> {
    const account = await this.db.commsBeemAccount.findUnique({ where: { id: 1 } });
    return {
      saved: account !== null,
      senderId: account?.senderId ?? null,
      keyHint: account ? `…${account.keyLast4}` : null,
      updatedAt: account?.updatedAt.toISOString() ?? null,
      canSave: this.settingsKey() !== null,
    };
  }

  /**
   * Saves the account. A key or secret left empty keeps the one saved, so
   * changing the sender name does not mean typing the key again.
   */
  async save(
    input: { apiKey?: string; secretKey?: string; senderId: string },
    byId: string | null,
  ) {
    const sealKey = this.settingsKey();
    if (!sealKey) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'The server cannot keep a Beem key safely yet. Whoever runs it must set BEEM_SETTINGS_KEY first.',
      );
    }
    if (!SENDER_ID.test(input.senderId)) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That sender name cannot be used.', {
        senderId: ['Up to 11 letters, digits or spaces, exactly as Beem registered it'],
      });
    }
    const existing = await this.db.commsBeemAccount.findUnique({ where: { id: 1 } });
    const apiKey = input.apiKey?.trim();
    const secretKey = input.secretKey?.trim();
    if (!existing && (!apiKey || !secretKey)) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        'Both the key and the secret are needed.',
        {
          ...(apiKey ? {} : { apiKey: ['Needed'] }),
          ...(secretKey ? {} : { secretKey: ['Needed'] }),
        },
      );
    }
    const data = {
      senderId: input.senderId,
      updatedById: byId,
      ...(apiKey ? { apiKeyEnc: seal(apiKey, sealKey), keyLast4: apiKey.slice(-4) } : {}),
      ...(secretKey ? { secretKeyEnc: seal(secretKey, sealKey) } : {}),
    };
    await this.db.commsBeemAccount.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...(data as Required<typeof data>) },
    });
    return { keyChanged: !!apiKey, secretChanged: !!secretKey };
  }

  /** Asks Beem for the credit with the saved account: the test that it works. */
  async test(): Promise<{ ok: true; credit: string | null } | { ok: false; error: string }> {
    const { provider } = await this.current();
    if (provider.name !== 'beem' && this.config.get('NODE_ENV') !== 'test') {
      return { ok: false, error: 'No Beem account is saved yet, so messages only go to the log.' };
    }
    try {
      const balance = await provider.balance();
      return { ok: true, credit: balance?.amount ?? null };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private settingsKey(): Buffer | null {
    const raw = this.config.get('BEEM_SETTINGS_KEY');
    return raw ? Buffer.from(raw, 'base64') : null;
  }

  private async openAccount() {
    const account = await this.db.commsBeemAccount.findUnique({ where: { id: 1 } });
    const sealKey = this.settingsKey();
    if (!account || !sealKey) return null;
    try {
      return {
        key: open(account.apiKeyEnc, sealKey),
        secret: open(account.secretKeyEnc, sealKey),
        senderId: account.senderId,
      };
    } catch {
      // Sealed with a different BEEM_SETTINGS_KEY: nothing can be sent with it
      // until it is saved again, and it must not go to Beem as garbage.
      return null;
    }
  }
}

import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ApiClient } from '../../generated/prisma/client.js';
import { PrismaDb } from '../database/prisma-clients.js';

/** Long enough that guessing is hopeless, short enough to paste into an env file. */
const BYTES = 32;
const PREFIX = 'irk_';
/** How often a key's "last used" is worth a write. */
const TOUCH_EVERY_MS = 60_000;

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/**
 * The keys a church's own app uses to reach the API.
 *
 * Only the hash is stored, as with sessions and invitations: a leak of the
 * table is not a leak of the keys. The first characters are kept in the clear
 * so a key can be recognised in a list without revealing it.
 */
@Injectable()
export class ApiClientService {
  constructor(private readonly db: PrismaDb) {}

  /** Makes a key. The plain text is returned once and never stored. */
  async create(input: {
    churchId: string;
    kind: 'REGISTRATION';
    name: string;
  }): Promise<{ key: string; client: ApiClient }> {
    const key = PREFIX + randomBytes(BYTES).toString('base64url');
    const client = await this.db.apiClient.create({
      data: {
        name: input.name,
        keyPrefix: key.slice(0, 12),
        keyHash: hashKey(key),
      },
    });
    return { key, client };
  }

  /** The client this key belongs to, if it is live and of the right kind. */
  async resolve(key: string, kind: string): Promise<ApiClient | null> {
    if (!key.startsWith(PREFIX)) return null;
    const client = await this.db.apiClient.findUnique({ where: { keyHash: hashKey(key) } });
    if (!client || client.revokedAt || client.kind !== kind) return null;

    // Written at most once a minute: this is for "is that key still in use?",
    // not an access log, and the form calls on every tap.
    const stale = !client.lastUsedAt || Date.now() - client.lastUsedAt.getTime() > TOUCH_EVERY_MS;
    if (stale) {
      await this.db.apiClient.update({
        where: { id: client.id },
        data: { lastUsedAt: new Date() },
      });
    }
    return client;
  }

  async churchIsActive(churchId: string): Promise<boolean> {
    const church = await this.db.church.findUnique({
      where: { id: churchId },
      select: { status: true },
    });
    return church?.status === 'ACTIVE';
  }

  async revoke(id: string): Promise<boolean> {
    const { count } = await this.db.apiClient.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  list(churchId?: string) {
    return this.db.apiClient.findMany({
      where: churchId ? {} : {},
      orderBy: { createdAt: 'desc' },
    });
  }
}

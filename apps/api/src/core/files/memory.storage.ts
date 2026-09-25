import { Injectable } from '@nestjs/common';
import type { FileStorage, StoredObject, UploadPolicy } from './file-storage.js';

type Held = StoredObject & { body: Buffer };

/**
 * A bucket in memory, for tests. It keeps the rules each upload policy set, so
 * a test can check them, and signs download links with an expiry it enforces
 * the way a real bucket would.
 */
@Injectable()
export class MemoryFileStorage implements FileStorage {
  readonly objects = new Map<string, Held>();
  readonly policies = new Map<string, UploadPolicy>();

  reset(): void {
    this.objects.clear();
    this.policies.clear();
  }

  /** What a browser's upload does: puts the bytes there, if the policy allows them. */
  upload(key: string, body: Buffer, contentType: string, modifiedAt = new Date()): void {
    const policy = this.policies.get(key);
    if (policy) {
      if (body.length > policy.maxBytes) throw new Error('EntityTooLarge');
      if (contentType !== policy.contentType) throw new Error('Policy Condition failed');
    }
    this.objects.set(key, { key, body, bytes: body.length, contentType, modifiedAt });
  }

  async uploadPolicy(
    key: string,
    rules: { contentType: string; maxBytes: number; expiresSeconds: number },
  ): Promise<UploadPolicy> {
    const policy = {
      url: 'memory://bucket',
      fields: { key, 'Content-Type': rules.contentType },
      maxBytes: rules.maxBytes,
      contentType: rules.contentType,
      expiresAt: new Date(Date.now() + rules.expiresSeconds * 1000).toISOString(),
    };
    this.policies.set(key, policy);
    return policy;
  }

  async head(key: string): Promise<StoredObject | null> {
    const held = this.objects.get(key);
    if (!held) return null;
    const { body: _body, ...object } = held;
    return object;
  }

  async downloadUrl(key: string, rules: { filename: string; expiresSeconds: number }) {
    const expires = Date.now() + rules.expiresSeconds * 1000;
    return `memory://bucket/${key}?expires=${expires}&filename=${encodeURIComponent(rules.filename)}`;
  }

  /** What following a download link does: the bytes, or nothing once it has expired. */
  open(url: string, now = Date.now()): Buffer | null {
    const parsed = new URL(url);
    if (Number(parsed.searchParams.get('expires')) < now) return null;
    return this.objects.get(parsed.pathname.replace(/^\//, ''))?.body ?? null;
  }

  async list(prefix: string): Promise<StoredObject[]> {
    return [...this.objects.values()]
      .filter((o) => o.key.startsWith(prefix))
      .map(({ body: _body, ...o }) => o);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async firstBytes(key: string, count: number): Promise<Buffer> {
    return this.objects.get(key)?.body.subarray(0, count) ?? Buffer.alloc(0);
  }
}

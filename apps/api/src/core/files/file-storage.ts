import type { Readable } from 'node:stream';

/**
 * Where files are kept (D24, corrected 25 Sept 2026): a folder on a disk that
 * outlives deploys — a Railway volume in production, a temporary folder in
 * tests. Behind one interface, the way text messages sit behind their
 * providers, so the place can change without the modules that keep files
 * noticing.
 */
export type StoredObject = { key: string; bytes: number; modifiedAt: Date };

export interface FileStorage {
  /**
   * Writes what arrives under a key, counting as it goes, and refuses — and
   * removes what it wrote — once it passes the limit. Nothing is left under
   * the key unless the whole of it arrived.
   */
  save(key: string, body: Readable, maxBytes: number): Promise<{ bytes: number }>;
  /** What is there under this key, or null. */
  head(key: string): Promise<StoredObject | null>;
  /** The bytes, to send to whoever may read them. */
  open(key: string): Readable;
  /** The first bytes, to check a file is what it says it is. */
  firstBytes(key: string, count: number): Promise<Buffer>;
  /** Everything kept, for the nightly check. */
  list(): Promise<StoredObject[]>;
  delete(key: string): Promise<void>;
}

/** Refused while being written: bigger than the limit. */
export class TooLarge extends Error {}

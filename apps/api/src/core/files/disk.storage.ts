import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { TooLarge, type FileStorage, type StoredObject } from './file-storage.js';

/** A key is a relative path of plain parts: outreach/sessions/<id>/<uuid>.pdf. */
const KEY = /^[a-z0-9-]+(\/[a-z0-9-]+)*\/[a-z0-9-]+\.[a-z0-9]+$/;
/** Written here first, and renamed into place only once complete. */
const PART = '.part';

/**
 * Files in a folder: FILES_DIR, which in production is where the Railway
 * volume is mounted, so they survive every deploy.
 */
export class DiskFileStorage implements FileStorage {
  constructor(readonly root: string) {}

  private where(key: string): string {
    if (!KEY.test(key)) throw new Error(`Not a file key: ${key}`);
    return path.join(this.root, ...key.split('/'));
  }

  async save(key: string, body: Readable, maxBytes: number): Promise<{ bytes: number }> {
    const file = this.where(key);
    await mkdir(path.dirname(file), { recursive: true });
    let bytes = 0;
    const count = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        done(bytes > maxBytes ? new TooLarge() : null, chunk);
      },
    });
    try {
      await pipeline(body, count, createWriteStream(file + PART, { flags: 'wx' }));
      await rename(file + PART, file);
      return { bytes };
    } catch (err) {
      await rm(file + PART, { force: true });
      throw err;
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const s = await stat(this.where(key));
      return { key, bytes: s.size, modifiedAt: s.mtime };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  open(key: string): Readable {
    return createReadStream(this.where(key));
  }

  async firstBytes(key: string, count: number): Promise<Buffer> {
    const handle = await open(this.where(key), 'r');
    try {
      const buffer = Buffer.alloc(count);
      const { bytesRead } = await handle.read(buffer, 0, count, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async list(): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) {
          const s = await stat(full);
          out.push({
            key: path.relative(this.root, full).split(path.sep).join('/'),
            bytes: s.size,
            modifiedAt: s.mtime,
          });
        }
      }
    };
    await walk(this.root);
    return out;
  }

  async delete(key: string): Promise<void> {
    // The nightly check also clears half-written uploads, whose names end in .part.
    const file = key.endsWith(PART)
      ? this.where(key.slice(0, -PART.length)) + PART
      : this.where(key);
    await rm(file, { force: true });
  }
}

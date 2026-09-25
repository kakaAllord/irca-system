import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import type { Tx } from '../database/db.service.js';
import { PrismaDb } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import { DiskFileStorage } from './disk.storage.js';
import { TooLarge, type FileStorage } from './file-storage.js';

/** What a file must be, checked as it arrives and before it is recorded. */
export type FileRules = {
  contentType: string;
  maxBytes: number;
  /** The bytes a file of this type starts with: '%PDF-' for a PDF. */
  magic?: string;
};

export type NewFile = {
  moduleKey: string;
  entityType: string;
  entityId: string;
  key: string;
  originalName: string;
};

/** A file with no row after this long was an upload abandoned half-way. */
const ORPHAN_AFTER_MS = 24 * 3_600_000;

/**
 * Files, once, for every module (D24, corrected 25 Sept 2026: kept on a
 * Railway volume rather than in a bucket).
 *
 * An upload comes through the API: it is written as it arrives, counted
 * against the limit and cut off the moment it passes it, then checked — the
 * whole of it arrived, and it starts with the bytes its kind of file starts
 * with — before a row says it exists. Reading streams it back from the API,
 * after the owning module has checked the reader may. Which permission covers
 * either is the owning module's to say; this only keeps the files.
 */
@Injectable()
export class FilesService {
  private disk: DiskFileStorage | null = null;

  constructor(
    private readonly db: PrismaDb,
    private readonly config: AppConfig,
  ) {}

  /** A throwaway folder in tests; FILES_DIR when it is set; otherwise none. */
  storage(): FileStorage | null {
    if (this.disk) return this.disk;
    const dir =
      this.config.get('NODE_ENV') === 'test'
        ? mkdtempSync(path.join(tmpdir(), 'irca-files-'))
        : this.config.get('FILES_DIR');
    if (!dir) return null;
    this.disk = new DiskFileStorage(dir);
    return this.disk;
  }

  private required(): FileStorage {
    const storage = this.storage();
    if (!storage) {
      throw new AppError(
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        'File storage is not set up yet, so nothing can be uploaded. Whoever runs the system sets it up (docs/deployment.md, "File storage").',
      );
    }
    return storage;
  }

  /** A fresh key under a prefix: outreach/sessions/<id>/<uuid>.pdf. */
  newKey(prefix: string, extension: string): string {
    return `${prefix}/${randomUUID()}.${extension}`;
  }

  /**
   * Writes an upload under a new key and checks it: within the limit, the
   * size the browser said it was (so a body cut short on the way is not
   * kept), and really the kind of file it claims to be. Anything refused is
   * removed. Returns the key and size, for `record`.
   */
  async receive(
    key: string,
    body: Readable,
    rules: FileRules,
    declared: { contentType: string; bytes: number },
  ) {
    const storage = this.required();
    const refuse = (status: number, message: string) =>
      new AppError(status, ErrorCode.VALIDATION_FAILED, message, { file: [message] });
    if (declared.contentType !== rules.contentType) {
      throw refuse(415, 'That is not the kind of file that belongs here.');
    }
    const limit = `${Math.round(rules.maxBytes / 1_048_576)} MB`;
    if (declared.bytes > rules.maxBytes) throw refuse(413, `The file is larger than ${limit}.`);

    let bytes: number;
    try {
      ({ bytes } = await storage.save(key, body, rules.maxBytes));
    } catch (err) {
      if (err instanceof TooLarge) throw refuse(413, `The file is larger than ${limit}.`);
      throw err;
    }
    const start = rules.magic ? await storage.firstBytes(key, rules.magic.length) : null;
    const problem =
      bytes !== declared.bytes
        ? 'The file did not arrive whole. Try again.'
        : bytes === 0 || (start && start.toString('latin1') !== rules.magic)
          ? 'That is not the kind of file that belongs here.'
          : null;
    if (problem) {
      await storage.delete(key);
      throw refuse(422, problem);
    }
    return { key, bytes };
  }

  /**
   * Records a file `receive` has kept, as the entity's current file. The one
   * before it is marked replaced and kept, file and all.
   */
  async record(tx: Tx, file: NewFile, received: { bytes: number }, rules: FileRules, by: string) {
    await tx.file.updateMany({
      where: { entityType: file.entityType, entityId: file.entityId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return tx.file.create({
      data: {
        ...file,
        originalName: file.originalName.slice(0, 200),
        contentType: rules.contentType,
        bytes: received.bytes,
        uploadedById: by,
      },
    });
  }

  /** The entity's current file, if it has one. */
  current(tx: Pick<Tx, 'file'>, entityType: string, entityId: string) {
    return tx.file.findFirst({
      where: { entityType, entityId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /** The bytes of a recorded file, to stream to a reader the owning module has let in. */
  async open(file: { key: string }): Promise<Readable> {
    const storage = this.required();
    if (!(await storage.head(file.key))) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'The file is missing from storage.');
    }
    return storage.open(file.key);
  }

  /** Removes a file received but never recorded, when recording it failed. */
  async discard(key: string) {
    await this.storage()?.delete(key);
  }

  /**
   * The nightly check (08 step 8.9): files older than a day with no row were
   * uploads abandoned half-way, and are removed; rows whose file is missing
   * are reported, never deleted, for a person to look into.
   */
  async sweep(now = new Date()) {
    const storage = this.storage();
    if (!storage) return { skipped: 'no file storage is set up' };
    const [objects, rows] = await Promise.all([
      storage.list(),
      this.db.file.findMany({ select: { key: true } }),
    ]);
    const recorded = new Set(rows.map((r) => r.key));
    const present = new Set(objects.map((o) => o.key));
    const removed: string[] = [];
    for (const o of objects) {
      if (recorded.has(o.key) || now.getTime() - o.modifiedAt.getTime() < ORPHAN_AFTER_MS) continue;
      await storage.delete(o.key);
      removed.push(o.key);
    }
    const missing = rows.map((r) => r.key).filter((key) => !present.has(key));
    return { removed, missing };
  }
}

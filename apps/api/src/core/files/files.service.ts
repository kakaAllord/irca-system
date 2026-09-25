import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import type { Tx } from '../database/db.service.js';
import { PrismaDb } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import type { FileStorage, UploadPolicy } from './file-storage.js';
import { MemoryFileStorage } from './memory.storage.js';
import { S3FileStorage } from './s3.storage.js';

/** What a file must be, checked by the bucket on upload and by the API after. */
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

/** How long an upload policy is good for: long enough for a slow connection. */
const UPLOAD_SECONDS = 15 * 60;
/** How long a download link works (08 step 8.9). */
export const DOWNLOAD_SECONDS = 5 * 60;
/** An object with no row after this long was an upload abandoned half-way. */
const ORPHAN_AFTER_MS = 24 * 3_600_000;

/**
 * Files, once, for every module (D24).
 *
 * The browser uploads straight to the bucket with a presigned POST whose
 * policy refuses the wrong type and anything too big, then tells the owning
 * module, which calls `record`: the object is looked at — there, the right
 * size, the right type, and starting with the right bytes — before a row says
 * it exists. Which permission covers an upload or a download is the owning
 * module's to say; this only keeps the files.
 */
@Injectable()
export class FilesService {
  private s3: S3FileStorage | null = null;

  constructor(
    private readonly db: PrismaDb,
    private readonly config: AppConfig,
    private readonly memory: MemoryFileStorage,
  ) {}

  /** Memory in tests; the bucket when one is set up; otherwise none. */
  storage(): FileStorage | null {
    if (this.config.get('NODE_ENV') === 'test') return this.memory;
    const endpoint = this.config.get('STORAGE_ENDPOINT');
    if (!endpoint) return null;
    this.s3 ??= new S3FileStorage({
      endpoint,
      region: this.config.get('STORAGE_REGION')!,
      bucket: this.config.get('STORAGE_BUCKET')!,
      accessKey: this.config.get('STORAGE_ACCESS_KEY')!,
      secretKey: this.config.get('STORAGE_SECRET_KEY')!,
    });
    return this.s3;
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

  uploadPolicy(key: string, rules: FileRules): Promise<UploadPolicy> {
    return this.required().uploadPolicy(key, {
      contentType: rules.contentType,
      maxBytes: rules.maxBytes,
      expiresSeconds: UPLOAD_SECONDS,
    });
  }

  /**
   * Records a file the browser has uploaded, once it has been checked, as
   * the entity's current file. The one before it is marked replaced and
   * kept, object and all.
   */
  async record(tx: Tx, file: NewFile, rules: FileRules, uploadedById: string) {
    const storage = this.required();
    const refuse = (message: string) =>
      new AppError(422, ErrorCode.VALIDATION_FAILED, message, { key: [message] });

    if (await tx.file.findUnique({ where: { key: file.key } })) {
      throw refuse('That file has already been recorded.');
    }
    const object = await storage.head(file.key);
    if (!object) throw refuse('The file has not finished uploading. Try again.');
    if (object.bytes > rules.maxBytes) {
      throw refuse(`The file is larger than ${Math.round(rules.maxBytes / 1_048_576)} MB.`);
    }
    const start = rules.magic ? await storage.firstBytes(file.key, rules.magic.length) : null;
    if (
      (object.contentType && object.contentType !== rules.contentType) ||
      (start && start.toString('latin1') !== rules.magic)
    ) {
      throw refuse('That is not the kind of file that belongs here.');
    }

    await tx.file.updateMany({
      where: { entityType: file.entityType, entityId: file.entityId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return tx.file.create({
      data: {
        ...file,
        originalName: file.originalName.slice(0, 200),
        contentType: rules.contentType,
        bytes: object.bytes,
        uploadedById,
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

  /** A link to read it that stops working after five minutes. */
  downloadUrl(file: { key: string; originalName: string }): Promise<string> {
    return this.required().downloadUrl(file.key, {
      filename: file.originalName,
      expiresSeconds: DOWNLOAD_SECONDS,
    });
  }

  /**
   * The nightly check (08 step 8.9): objects older than a day with no row
   * were uploads abandoned half-way, and are removed; rows whose object is
   * missing are reported, never deleted, for a person to look into.
   */
  async sweep(now = new Date()) {
    const storage = this.storage();
    if (!storage) return { skipped: 'no file storage is set up' };
    const [objects, rows] = await Promise.all([
      storage.list(''),
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

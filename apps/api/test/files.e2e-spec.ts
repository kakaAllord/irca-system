import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { utimes } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Db } from '../src/core/database/db.service.js';
import { FilesService, type FileRules } from '../src/core/files/files.service.js';
import type { DiskFileStorage } from '../src/core/files/disk.storage.js';
import { createApp, createChurch, ownerDb, truncateAll } from './helpers.js';

const PDF: FileRules = { contentType: 'application/pdf', maxBytes: 10 * 1_048_576, magic: '%PDF-' };
const pdf = (size = 2048) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(size)]);
const body = (bytes: Buffer) => Readable.from([bytes]);
const declared = (bytes: Buffer) => ({ contentType: 'application/pdf', bytes: bytes.length });

/** Files kept on the church's own disk, for every module (08 step 8.9, D24). */
describe('files', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let files: FilesService;
  let disk: DiskFileStorage;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    files = app.get(FilesService);
    disk = files.storage() as DiskFileStorage;
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    await createChurch(db);
    for (const o of await disk.list()) await disk.delete(o.key);
  });

  const entity = { moduleKey: 'outreach', entityType: 'outreach_session', entityId: randomUUID() };
  const keep = async (bytes: Buffer, name = 'report.pdf') => {
    const key = files.newKey('outreach/sessions/x', 'pdf');
    const received = await files.receive(key, body(bytes), PDF, declared(bytes));
    return app
      .get(Db)
      .tx((tx) =>
        files.record(tx, { ...entity, key, originalName: name }, received, PDF, randomUUID()),
      );
  };

  it('keeps a PDF, and stops reading one the moment it passes the limit', async () => {
    const row = await keep(pdf());
    expect(await disk.head(row.key)).toMatchObject({ bytes: pdf().length });

    const big = pdf(12 * 1_048_576);
    const key = files.newKey('outreach/sessions/x', 'pdf');
    // Said to be small, but is not: cut off as it arrives, and nothing left behind.
    await expect(
      files.receive(key, body(big), PDF, { contentType: 'application/pdf', bytes: 1000 }),
    ).rejects.toThrow(/larger than 10 MB/);
    await expect(files.receive(key, body(big), PDF, declared(big))).rejects.toThrow(
      /larger than 10 MB/,
    );
    expect(await disk.list()).toHaveLength(1);
  });

  it('refuses what is not a PDF, and a body cut short on the way', async () => {
    const zip = Buffer.from('PK\u0003\u0004 a zip in disguise');
    await expect(
      files.receive(files.newKey('outreach/sessions/x', 'pdf'), body(zip), PDF, declared(zip)),
    ).rejects.toThrow(/not the kind of file/);
    const word = pdf();
    await expect(
      files.receive(files.newKey('outreach/sessions/x', 'pdf'), body(word), PDF, {
        contentType: 'application/msword',
        bytes: word.length,
      }),
    ).rejects.toThrow(/not the kind of file/);
    const whole = pdf(4096);
    await expect(
      files.receive(
        files.newKey('outreach/sessions/x', 'pdf'),
        body(whole.subarray(0, 1000)),
        PDF,
        declared(whole),
      ),
    ).rejects.toThrow(/did not arrive whole/);
    expect(await disk.list()).toEqual([]);
  });

  it('keeps the old version when a new one replaces it', async () => {
    const first = await keep(pdf(), 'first.pdf');
    await keep(pdf(4096), 'second.pdf');
    const current = await files.current(app.get(Db).client, entity.entityType, entity.entityId);
    expect(current?.originalName).toBe('second.pdf');
    const { rows } = await db.query(
      `select original_name, deleted_at is not null as replaced from files order by uploaded_at`,
    );
    expect(rows).toEqual([
      { original_name: 'first.pdf', replaced: true },
      { original_name: 'second.pdf', replaced: false },
    ]);
    // The file itself is kept too.
    expect(await disk.head(first.key)).not.toBeNull();
  });

  it('removes uploads abandoned a day ago, and reports files that have gone', async () => {
    const kept = await keep(pdf());
    const day = 24 * 3_600_000;
    const abandoned = files.newKey('outreach/sessions/x', 'pdf');
    await disk.save(abandoned, body(pdf()), PDF.maxBytes);
    const old = new Date(Date.now() - 2 * day);
    await utimes(path.join(disk.root, ...abandoned.split('/')), old, old);
    const uploading = files.newKey('outreach/sessions/x', 'pdf');
    await disk.save(uploading, body(pdf()), PDF.maxBytes);
    await db.query(
      `insert into files (id, module_key, entity_type, entity_id, key, original_name, content_type, bytes, uploaded_by_id)
       values ($1, 'outreach', 'outreach_session', $2, 'outreach/sessions/y/lost.pdf', 'lost.pdf', 'application/pdf', 10, $3)`,
      [randomUUID(), randomUUID(), randomUUID()],
    );

    expect(await files.sweep()).toEqual({
      removed: [abandoned],
      missing: ['outreach/sessions/y/lost.pdf'],
    });
    // Still recent: left alone until it is a day old.
    expect(await disk.head(uploading)).not.toBeNull();
    expect(await disk.head(kept.key)).not.toBeNull();
  });

  it('lets the application record and replace files, and never delete their rows', async () => {
    const appRole = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await appRole.connect();
    try {
      await expect(appRole.query('delete from files')).rejects.toThrow(/permission denied/);
      await expect(appRole.query(`update files set key = 'x'`)).rejects.toThrow(
        /permission denied/,
      );
      await appRole.query(`update files set deleted_at = now() where false`);
    } finally {
      await appRole.end();
    }
  });
});

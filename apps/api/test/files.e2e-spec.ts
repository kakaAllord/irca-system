import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { Db } from '../src/core/database/db.service.js';
import { FilesService, type FileRules } from '../src/core/files/files.service.js';
import { MemoryFileStorage } from '../src/core/files/memory.storage.js';
import { createApp, createChurch, ownerDb, truncateAll } from './helpers.js';

const PDF: FileRules = { contentType: 'application/pdf', maxBytes: 10 * 1_048_576, magic: '%PDF-' };
const pdf = (size = 2048) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(size)]);

/** Files kept in object storage, for every module (08 step 8.9, D24). */
describe('files', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let files: FilesService;
  let bucket: MemoryFileStorage;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    files = app.get(FilesService);
    bucket = app.get(MemoryFileStorage);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    await createChurch(db);
    bucket.reset();
  });

  const entity = { moduleKey: 'outreach', entityType: 'outreach_session', entityId: randomUUID() };
  const record = (key: string, name = 'report.pdf') =>
    app
      .get(Db)
      .tx((tx) => files.record(tx, { ...entity, key, originalName: name }, PDF, randomUUID()));

  it('sets the upload rules in the policy the bucket enforces', async () => {
    const key = files.newKey('outreach/sessions/x', 'pdf');
    const policy = await files.uploadPolicy(key, PDF);
    expect(policy).toMatchObject({ contentType: 'application/pdf', maxBytes: 10_485_760 });
    // What the bucket does with a 12 MB file, or a Word document.
    expect(() => bucket.upload(key, pdf(12 * 1_048_576), 'application/pdf')).toThrow(/TooLarge/);
    expect(() => bucket.upload(key, Buffer.from('PK'), 'application/msword')).toThrow(/Policy/);
  });

  it('records a file only once it is there, small enough, and really a PDF', async () => {
    const key = files.newKey('outreach/sessions/x', 'pdf');
    await expect(record(key)).rejects.toThrow(/not finished uploading/);

    bucket.upload('fake.pdf', Buffer.from('PK\u0003\u0004 a zip'), 'application/pdf');
    await expect(record('fake.pdf')).rejects.toThrow(/not the kind of file/);

    bucket.upload(key, pdf(), 'application/pdf');
    const row = await record(key);
    expect(row).toMatchObject({ key, bytes: pdf().length, contentType: 'application/pdf' });
    await expect(record(key)).rejects.toThrow(/already been recorded/);
  });

  it('keeps the old version when a new one replaces it', async () => {
    const first = files.newKey('outreach/sessions/x', 'pdf');
    const second = files.newKey('outreach/sessions/x', 'pdf');
    bucket.upload(first, pdf(), 'application/pdf');
    bucket.upload(second, pdf(4096), 'application/pdf');
    await record(first, 'first.pdf');
    await record(second, 'second.pdf');

    const current = await files.current(app.get(Db).client, entity.entityType, entity.entityId);
    expect(current?.originalName).toBe('second.pdf');
    const { rows } = await db.query(`select key, deleted_at is not null as replaced from files`);
    expect(rows).toEqual(
      expect.arrayContaining([
        { key: first, replaced: true },
        { key: second, replaced: false },
      ]),
    );
    // The object is kept too.
    expect(await bucket.head(first)).not.toBeNull();
  });

  it('hands out links that stop working after five minutes', async () => {
    const key = files.newKey('outreach/sessions/x', 'pdf');
    bucket.upload(key, pdf(), 'application/pdf');
    const url = await files.downloadUrl({ key, originalName: 'report.pdf' });
    expect(bucket.open(url)).not.toBeNull();
    expect(bucket.open(url, Date.now() + 4 * 60_000)).not.toBeNull();
    expect(bucket.open(url, Date.now() + 6 * 60_000)).toBeNull();
  });

  it('removes uploads abandoned a day ago, and reports files whose object has gone', async () => {
    const kept = files.newKey('outreach/sessions/x', 'pdf');
    bucket.upload(kept, pdf(), 'application/pdf');
    await record(kept);
    const day = 24 * 3_600_000;
    bucket.upload(
      'outreach/sessions/x/abandoned.pdf',
      pdf(),
      'application/pdf',
      new Date(Date.now() - 2 * day),
    );
    bucket.upload('outreach/sessions/x/uploading.pdf', pdf(), 'application/pdf');
    await db.query(
      `insert into files (id, module_key, entity_type, entity_id, key, original_name, content_type, bytes, uploaded_by_id)
       values ($1, 'outreach', 'outreach_session', $2, 'outreach/sessions/y/lost.pdf', 'lost.pdf', 'application/pdf', 10, $3)`,
      [randomUUID(), randomUUID(), randomUUID()],
    );

    expect(await files.sweep()).toEqual({
      removed: ['outreach/sessions/x/abandoned.pdf'],
      missing: ['outreach/sessions/y/lost.pdf'],
    });
    // Still uploading: left alone until it is a day old.
    expect(await bucket.head('outreach/sessions/x/uploading.pdf')).not.toBeNull();
    expect(await bucket.head(kept)).not.toBeNull();
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

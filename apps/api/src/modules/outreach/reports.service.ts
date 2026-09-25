import { Injectable } from '@nestjs/common';
import { Db } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { Readable } from 'node:stream';
import { FilesService, type FileRules } from '../../core/files/files.service.js';
import { day } from './sessions.service.js';

/** A session report: a PDF of up to 10 MB (08 step 8.9). */
export const REPORT: FileRules = {
  contentType: 'application/pdf',
  maxBytes: 10 * 1_048_576,
  magic: '%PDF-',
};
const ENTITY = 'outreach_session';

/**
 * The report a leader writes after a Saturday, the way they always have,
 * kept beside the session, on the church's own file storage. One per session; attaching another keeps the old
 * one as an earlier version.
 *
 * A report may name people and places, and erasing a person cannot reach
 * inside a PDF: docs/data-inventory.md says so, and the erasure runbook has
 * the operator check the reports by hand.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  /**
   * A report the browser sends, checked as it arrives — a PDF, up to 10 MB,
   * whole — then recorded as the session's report. If recording fails, the
   * file it wrote goes too.
   */
  async attach(
    sessionId: string,
    body: Readable,
    input: { name: string; bytes: number; contentType: string },
  ) {
    const session = await this.session(sessionId);
    const key = this.files.newKey(prefix(sessionId), 'pdf');
    const received = await this.files.receive(key, body, REPORT, input);
    try {
      return await this.db.tx(async (tx) => {
        const file = await this.files.record(
          tx,
          {
            moduleKey: 'outreach',
            entityType: ENTITY,
            entityId: sessionId,
            key,
            originalName: input.name,
          },
          received,
          REPORT,
          this.auth.userId!,
        );
        await this.audit.recordIn(tx, {
          action: 'outreach.report.attached',
          entityType: 'outreach_session',
          entityId: sessionId,
          summary: `Attached the report for the Saturday of ${day(session.heldOn)}: ${file.originalName}`,
        });
        return { id: file.id, name: file.originalName, bytes: file.bytes };
      });
    } catch (err) {
      await this.files.discard(key);
      throw err;
    }
  }

  /** What there is: the current report and its earlier versions, without links. */
  async describe(sessionId: string) {
    const rows = await this.db.client.file.findMany({
      where: { entityType: ENTITY, entityId: sessionId },
      orderBy: { uploadedAt: 'desc' },
    });
    const users = await this.db.client.user.findMany({
      where: { id: { in: rows.map((r) => r.uploadedById) } },
      select: { id: true, fullName: true },
    });
    const view = (r: (typeof rows)[number]) => ({
      id: r.id,
      name: r.originalName,
      bytes: r.bytes,
      uploadedAt: r.uploadedAt.toISOString(),
      uploadedBy: users.find((u) => u.id === r.uploadedById)?.fullName ?? null,
    });
    const current = rows.find((r) => !r.deletedAt);
    return {
      current: current ? view(current) : null,
      earlier: rows.filter((r) => r.deletedAt).map(view),
    };
  }

  /** The report, or an earlier version, as bytes to send to someone who may read it. */
  async read(sessionId: string, fileId?: string) {
    await this.session(sessionId);
    const file = fileId
      ? await this.db.client.file.findFirst({
          where: { id: fileId, entityType: ENTITY, entityId: sessionId },
        })
      : await this.files.current(this.db.client, ENTITY, sessionId);
    if (!file) throw notFound('This Saturday has no report.');
    return { stream: await this.files.open(file), name: file.originalName, bytes: file.bytes };
  }

  private async session(id: string) {
    const session = await this.db.client.outreachSession.findUnique({ where: { id } });
    if (!session) throw notFound('No such Saturday.');
    return session;
  }
}

const prefix = (sessionId: string) => `outreach/sessions/${sessionId}`;

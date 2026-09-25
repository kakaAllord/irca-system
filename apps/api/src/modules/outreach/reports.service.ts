import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { Db } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { DOWNLOAD_SECONDS, FilesService, type FileRules } from '../../core/files/files.service.js';
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
 * kept beside the session. One per session; attaching another keeps the old
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

  /** Where the browser uploads it: a policy the bucket enforces. */
  async uploadPolicy(sessionId: string) {
    await this.session(sessionId);
    const key = this.files.newKey(prefix(sessionId), 'pdf');
    return { key, policy: await this.files.uploadPolicy(key, REPORT) };
  }

  /** Once uploaded: checked, then recorded as the session's report. */
  async attach(sessionId: string, input: { key: string; name: string }) {
    return this.db.tx(async (tx) => {
      const session = await this.session(sessionId);
      if (!input.key.startsWith(`${prefix(sessionId)}/`)) {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_FAILED,
          'That upload was not for this Saturday.',
          {
            key: ['Not this Saturday'],
          },
        );
      }
      const file = await this.files.record(
        tx,
        {
          moduleKey: 'outreach',
          entityType: ENTITY,
          entityId: sessionId,
          key: input.key,
          originalName: input.name,
        },
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

  /** A link to the report, or an earlier version, that works for five minutes. */
  async link(sessionId: string, fileId?: string) {
    await this.session(sessionId);
    const file = fileId
      ? await this.db.client.file.findFirst({
          where: { id: fileId, entityType: ENTITY, entityId: sessionId },
        })
      : await this.files.current(this.db.client, ENTITY, sessionId);
    if (!file) throw notFound('This Saturday has no report.');
    return {
      url: await this.files.downloadUrl(file),
      name: file.originalName,
      expiresAt: new Date(Date.now() + DOWNLOAD_SECONDS * 1000).toISOString(),
    };
  }

  private async session(id: string) {
    const session = await this.db.client.outreachSession.findUnique({ where: { id } });
    if (!session) throw notFound('No such Saturday.');
    return session;
  }
}

const prefix = (sessionId: string) => `outreach/sessions/${sessionId}`;

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BLANKS, ErrorCode, SMS_LANGS, blanksOf, segments, type SmsLang } from '@irca/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { Db, type Tx } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { AudiencesService } from './audiences.service.js';

export type Bodies = Partial<Record<SmsLang, string>>;
export type TemplateInput = { name: string; bodies: Bodies };

const MAX_SEGMENTS = 6;
const refuse = (message: string) => new AppError(403, ErrorCode.FORBIDDEN, message);
const conflict = (message: string) => new AppError(409, ErrorCode.CONFLICT, message);

const withBodies = {
  bodies: true,
  department: { select: { id: true, name: true } },
} satisfies Prisma.CommsTemplateInclude;
type Row = Prisma.CommsTemplateGetPayload<{ include: typeof withBodies }>;

/**
 * The words, agreed once and then used without asking anyone (D21; 07 step
 * 7.9).
 *
 * A template goes draft → pending → active, or rejected. Changing an active
 * one never changes it: it makes the next version, in draft, and the old one
 * keeps sending until the new one is approved, when the old is retired — so a
 * department is never left without words mid-week. The database refuses any
 * change to the words once they are submitted (trigger
 * comms_template_body_guard). Nothing is ever deleted.
 *
 * Communications writes its own templates and any department's; a
 * department's leaders write their own department's. Only someone holding
 * `comms.templates.approve` approves, and never what they submitted.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly audiences: AudiencesService,
  ) {}

  /**
   * Communications sees every template, or one department's. A leader sees
   * their department's, and the active ones of Communications they may use.
   */
  async list(departmentId: string | null | undefined) {
    let where: Prisma.CommsTemplateWhereInput;
    if (this.auth.has('comms.templates.read')) {
      where = departmentId === undefined ? {} : { departmentId };
    } else {
      if (!departmentId) throw refuse('Choose one of the departments you lead.');
      await this.audiences.requireLeads(departmentId, 'read');
      where = { OR: [{ departmentId }, { departmentId: null, status: 'ACTIVE' }] };
    }
    const rows = await this.db.client.commsTemplate.findMany({
      where,
      include: withBodies,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
    return rows.map(toDto);
  }

  async get(id: string) {
    const row = await this.find(this.db.client, id);
    await this.requireMayRead(row);
    return toDto(row);
  }

  async create(departmentId: string | null, input: TemplateInput) {
    await this.requireMayDraft(departmentId);
    const bodies = this.check(input.bodies);
    const row = await this.db.tx(async (tx) => {
      const made = await tx.commsTemplate.create({
        data: {
          familyId: randomUUID(),
          departmentId,
          name: input.name,
          fields: fieldsOf(bodies),
          createdById: this.auth.actorUserId!,
          bodies: { create: bodies.map(([lang, body]) => ({ lang, body })) },
        },
        include: withBodies,
      });
      await this.record(tx, made, 'comms.template.drafted', `Drafted the template "${made.name}"`);
      return made;
    });
    return toDto(row);
  }

  /**
   * A draft, or a rejected one, is changed where it is. An active one gets a
   * new version instead; one waiting for approval cannot change at all.
   */
  async update(id: string, input: TemplateInput) {
    const current = await this.find(this.db.client, id);
    await this.requireMayDraft(current.departmentId);
    const bodies = this.check(input.bodies);

    if (current.status === 'PENDING') {
      throw conflict('It is waiting for approval. Ask for it to be rejected if it needs changing.');
    }
    if (current.status === 'RETIRED') throw conflict('It is retired. Write a new one instead.');

    const row = await this.db.tx(async (tx) => {
      if (current.status === 'ACTIVE') {
        const newer = await tx.commsTemplate.findFirst({
          where: {
            familyId: current.familyId,
            version: { gt: current.version },
            status: { not: 'RETIRED' },
          },
        });
        if (newer) {
          throw conflict(
            `Version ${newer.version} of these words is already being written. Change that one.`,
          );
        }
        const next = await tx.commsTemplate.create({
          data: {
            familyId: current.familyId,
            version: current.version + 1,
            supersedesId: current.id,
            departmentId: current.departmentId,
            name: input.name,
            fields: fieldsOf(bodies),
            createdById: this.auth.actorUserId!,
            bodies: { create: bodies.map(([lang, body]) => ({ lang, body })) },
          },
          include: withBodies,
        });
        await this.record(
          tx,
          next,
          'comms.template.versioned',
          `Started version ${next.version} of "${next.name}"; version ${current.version} keeps sending until it is approved`,
        );
        return next;
      }

      // Draft, or rejected and so back to draft: only a draft's words may be
      // written, and the trigger holds the database to that.
      await tx.commsTemplate.update({
        where: { id },
        data: {
          status: 'DRAFT',
          name: input.name,
          fields: fieldsOf(bodies),
          submittedAt: null,
          submittedById: null,
          decidedAt: null,
          decidedById: null,
          decisionNote: null,
        },
      });
      await tx.commsTemplateBody.deleteMany({ where: { templateId: id } });
      await tx.commsTemplateBody.createMany({
        data: bodies.map(([lang, body]) => ({ templateId: id, lang, body })),
      });
      const changed = await this.find(tx, id);
      await this.record(
        tx,
        changed,
        'comms.template.changed',
        `Changed the draft "${changed.name}"`,
      );
      return changed;
    });
    return toDto(row);
  }

  async submit(id: string) {
    const row = await this.find(this.db.client, id);
    await this.requireMayDraft(row.departmentId);
    if (row.status !== 'DRAFT') throw conflict('Only a draft can be sent for approval.');
    await this.db.tx(async (tx) => {
      await tx.commsTemplate.update({
        where: { id },
        data: { status: 'PENDING', submittedAt: new Date(), submittedById: this.auth.actorUserId },
      });
      await this.record(
        tx,
        row,
        'comms.template.submitted',
        `Asked for "${row.name}" to be approved`,
      );
    });
  }

  /** Approving the words once is what lets the department use them every week. */
  async approve(id: string, note: string | null) {
    await this.db.tx(async (tx) => {
      const row = await this.pending(tx, id);
      if (
        row.submittedById === this.auth.actorUserId ||
        row.createdById === this.auth.actorUserId
      ) {
        throw new AppError(
          409,
          ErrorCode.CANNOT_DECIDE_OWN_REQUEST,
          'Someone else must approve this. Nobody approves their own words.',
        );
      }
      await tx.commsTemplate.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          decidedAt: new Date(),
          decidedById: this.auth.actorUserId,
          decisionNote: note,
        },
      });
      // The version it replaces stops only now, so there is never a gap.
      const retired = await tx.commsTemplate.updateMany({
        where: { familyId: row.familyId, id: { not: id }, status: 'ACTIVE' },
        data: { status: 'RETIRED' },
      });
      await this.record(
        tx,
        row,
        'comms.template.approved',
        `Approved "${row.name}"${row.version > 1 ? ` (version ${row.version})` : ''}${retired.count ? ', retiring the version before it' : ''}`,
      );
    });
    this.usage.inc('comms.templates.approved');
  }

  async reject(id: string, note: string) {
    await this.db.tx(async (tx) => {
      const row = await this.pending(tx, id);
      await tx.commsTemplate.update({
        where: { id },
        data: {
          status: 'REJECTED',
          decidedAt: new Date(),
          decidedById: this.auth.actorUserId,
          decisionNote: note,
        },
      });
      await this.record(tx, row, 'comms.template.rejected', `Sent "${row.name}" back: ${note}`);
    });
  }

  /** Stops it being used. Kept, so the messages it wrote still say what they said. */
  async retire(id: string) {
    const row = await this.find(this.db.client, id);
    await this.requireMayDraft(row.departmentId);
    if (row.status === 'RETIRED') return;
    if (row.status === 'PENDING') throw conflict('It is waiting for approval. Reject it instead.');
    await this.db.tx(async (tx) => {
      await tx.commsTemplate.update({ where: { id }, data: { status: 'RETIRED' } });
      await this.record(tx, row, 'comms.template.retired', `Retired "${row.name}"`);
    });
  }

  // ── Checks ────────────────────────────────────────────────────────────

  /**
   * Every body short enough, and every blank one a message can fill. An
   * unknown blank is refused now, by name, rather than sent as "{{nickname}}".
   */
  private check(raw: Bodies): [SmsLang, string][] {
    const bodies = SMS_LANGS.map(
      (lang) => [lang, (raw[lang] ?? '').trim()] as [SmsLang, string],
    ).filter(([, body]) => body !== '');
    if (!bodies.length) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        'Write the message in at least one language.',
        {
          bodies: ['Write it in at least one language'],
        },
      );
    }
    const problems: Record<string, string[]> = {};
    for (const [lang, body] of bodies) {
      const unknown = blanksOf(body).filter((b) => !(b in BLANKS));
      if (unknown.length) {
        problems[lang] = [
          `${unknown.map((u) => `{{${u}}}`).join(', ')} cannot be filled. Use ${Object.keys(BLANKS)
            .map((b) => `{{${b}}}`)
            .join(', ')}.`,
        ];
      } else if (segments(body).segments > MAX_SEGMENTS || body.length > 918) {
        problems[lang] = [`Too long: at most ${MAX_SEGMENTS} text messages' worth.`];
      }
    }
    if (Object.keys(problems).length) {
      const first = Object.values(problems)[0]![0]!;
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, first, problems);
    }
    return bodies;
  }

  private async requireMayDraft(departmentId: string | null) {
    if (this.auth.has('comms.templates.draft')) return;
    if (departmentId === null)
      throw refuse("Only Communications writes Communications' own templates.");
    await this.audiences.requireLeads(departmentId, 'draft');
  }

  private async requireMayRead(row: Row) {
    if (this.auth.has('comms.templates.read')) return;
    if (row.departmentId === null && row.status === 'ACTIVE') {
      if (this.auth.has('comms.department.read')) return;
    } else if (row.departmentId) {
      await this.audiences.requireLeads(row.departmentId, 'read');
      return;
    }
    throw refuse('You do not lead this department.');
  }

  private async pending(tx: Tx, id: string) {
    if (!this.auth.has('comms.templates.approve'))
      throw refuse('Only Communications approves templates.');
    const row = await this.find(tx, id);
    if (row.status !== 'PENDING') throw conflict('It is not waiting for approval.');
    return row;
  }

  private async find(tx: Pick<Tx, 'commsTemplate'>, id: string): Promise<Row> {
    const row = await tx.commsTemplate.findUnique({ where: { id }, include: withBodies });
    if (!row) throw notFound('No such template.');
    return row;
  }

  private record(tx: Tx, row: { id: string }, action: string, summary: string) {
    return this.audit.recordIn(tx, {
      action,
      entityType: 'comms_template',
      entityId: row.id,
      summary,
    });
  }
}

const fieldsOf = (bodies: [SmsLang, string][]) => [
  ...new Set(bodies.flatMap(([, b]) => blanksOf(b))),
];

function toDto(row: Row) {
  return {
    id: row.id,
    familyId: row.familyId,
    version: row.version,
    name: row.name,
    status: row.status,
    department: row.department,
    fields: row.fields,
    bodies: Object.fromEntries(row.bodies.map((b) => [b.lang, b.body])) as Bodies,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    createdById: row.createdById,
    submittedById: row.submittedById,
  };
}

import { Injectable } from '@nestjs/common';
import {
  BLANKS,
  ErrorCode,
  SMS_LANGS,
  blanksOf,
  renderSms,
  segments,
  senderBlanks,
  type SmsLang,
} from '@irca/shared';
import { Db, type Tx } from '../../core/database/db.service.js';
import { sql } from '../../core/database/sql.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { AudienceResolver, type Resolved } from '../../core/comms/audience.resolver.js';
import { firstNameOf } from '../../core/comms/audience.registry.js';
import { AudiencesService, type Sender } from './audiences.service.js';
import { commsSettings } from './settings.js';

export type Bodies = Partial<Record<SmsLang, string>>;

export type SendInput = {
  /** Null: Communications itself. */
  departmentId: string | null;
  audience: { key: string; params: Record<string, unknown> };
  /** An approved template… */
  templateId?: string | null;
  /** …or words no template covers, which only Communications may send. */
  bodies?: Bodies | null;
  /** What the sender types into the blanks: event_name, date, time, venue. */
  fields?: Record<string, string>;
  /** Later, rather than now. */
  scheduledFor?: string | null;
  /** Set when a beat sends it. */
  scheduleId?: string | null;
};

type Prepared = Awaited<ReturnType<SendingService['prepare']>>;

const refuse = (message: string) => new AppError(403, ErrorCode.FORBIDDEN, message);
const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, ErrorCode.VALIDATION_FAILED, message, details);

/** TZS, the way the church writes it: "52,300", or "52,300.50". */
export function tzs(cents: bigint): string {
  const whole = cents / 100n;
  const rest = cents % 100n;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest ? `${grouped}.${rest.toString().padStart(2, '0')}` : grouped;
}
const toCents = (money: string) => BigInt(Math.round(Number(money) * 100));
const fromCents = (cents: bigint) =>
  `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;

/**
 * Sending: the one action in the system that spends real money and cannot
 * be undone (07 step 7.10). Every refusal says why, in words.
 *
 * Preview, send and a beat all come through `prepare`, in this order, inside
 * one transaction: may this person send for this department; may they reach
 * this audience; are the words allowed; what will it cost against today's
 * limit. A send then writes the message and one outbox row per number, and
 * nothing leaves until the background sender picks them up — so a crash
 * half-way leaves everything owed or nothing, as with email.
 */
@Injectable()
export class SendingService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly audiences: AudiencesService,
    private readonly resolver: AudienceResolver,
  ) {}

  /** What a send would do, and whether it would be allowed, writing nothing. */
  async preview(input: SendInput) {
    return this.db.tx(async (tx) => {
      const p = await this.prepare(tx, input, this.audiences.requestSender());
      return this.describe(p);
    });
  }

  /** Sends, or refuses with the reason. */
  async send(input: SendInput, sender: Sender = this.audiences.requestSender()) {
    const result = await this.db.tx(
      async (tx) => {
        // Two sends pressed at once must not both fit under the same limit.
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('irca:comms-cap'))`;
        const p = await this.prepare(tx, input, sender);
        if (p.problem) throw new AppError(409, ErrorCode.CONFLICT, p.problem);
        return this.write(tx, p, sender);
      },
      { timeout: 30_000 },
    );
    this.usage.inc('sms.queued', result.recipientCount);
    this.usage.inc('sms.skipped_opt_out', result.optedOut);
    this.usage.inc('sms.segments', result.segments);
    this.usage.inc('sms.cost', Math.round(Number(result.cost)));
    return {
      id: result.id,
      recipientCount: result.recipientCount,
      skipped: result.skippedCount,
      cost: result.cost,
    };
  }

  // ── The checks, in order ──────────────────────────────────────────────

  async prepare(tx: Tx, input: SendInput, sender: Sender) {
    const settings = await commsSettings(tx);

    // 1 and 2: may they send for this department, to these people?
    await this.audiences.authorize(
      tx,
      input.departmentId,
      input.audience.key,
      input.audience.params,
      sender,
    );
    const department = input.departmentId
      ? await tx.department.findUnique({ where: { id: input.departmentId } })
      : null;

    // 3: are the words allowed?
    const { bodies, template } = await this.words(tx, input, sender);
    const fields = [...new Set(Object.values(bodies).flatMap((b) => blanksOf(b ?? '')))];
    const typed = Object.fromEntries(
      Object.entries(input.fields ?? {}).map(([k, v]) => [k, String(v).trim().slice(0, 60)]),
    );
    const missing = senderBlanks(fields).filter((f) => !typed[f]);
    if (missing.length) {
      throw unprocessable(
        `Fill in ${missing.map((f) => BLANKS[f].label.toLowerCase()).join(', ')} before sending.`,
        { fields: missing },
      );
    }

    // 4: who, in which language, saying exactly what, and what it costs.
    const { name, recipients } = await this.resolver.resolve(
      tx,
      input.audience.key,
      input.audience.params,
      settings.defaultLang,
    );
    const church = await tx.church.findFirst();
    const common = {
      ...typed,
      church_name: church?.name ?? '',
      department_name: department?.name ?? 'Communications',
    };
    const rendered = recipients.map((r) => this.render(r, bodies, settings.defaultLang, common));
    const segmentsTotal = rendered.reduce((n, r) => n + r.segments, 0);
    const price = toCents(settings.pricePerSegment);
    const cost = BigInt(segmentsTotal) * price;

    const when = this.when(input.scheduledFor);
    let problem: string | null = null;
    let spentToday = 0n;
    // No limit saved means no limit: Communications sets one in Comms →
    // Settings only if the church wants spending held to a figure.
    if (settings.dailyCap !== null) {
      spentToday = await this.spentOn(tx, when ?? new Date());
      const cap = toCents(settings.dailyCap);
      if (spentToday + cost > cap) {
        problem = `This would bring ${when ? "that day's" : "today's"} messages to ${tzs(spentToday + cost)} TZS; the daily limit is ${tzs(cap)} TZS.`;
      }
    }
    if (!problem && !rendered.some((r) => r.status === 'PENDING')) {
      problem = 'Nobody in this audience can be sent to.';
    }

    return {
      input,
      department,
      template,
      bodies,
      fields: typed,
      audienceName: name,
      recipients: rendered,
      segments: segmentsTotal,
      price,
      cost,
      spentToday,
      dailyCap: settings.dailyCap,
      scheduledFor: when,
      problem,
    };
  }

  /** An approved template of this department or of Communications, or free text. */
  private async words(tx: Tx, input: SendInput, sender: Sender) {
    if (input.templateId) {
      const template = await tx.commsTemplate.findUnique({
        where: { id: input.templateId },
        include: { bodies: true },
      });
      if (!template) throw notFound('No such template.');
      if (template.status !== 'ACTIVE') {
        throw refuse(
          'Those words are not approved yet. Communications approves a template before it is used.',
        );
      }
      if (
        input.departmentId !== null &&
        template.departmentId !== null &&
        template.departmentId !== input.departmentId
      ) {
        throw refuse('That template belongs to another department.');
      }
      const bodies = Object.fromEntries(template.bodies.map((b) => [b.lang, b.body])) as Bodies;
      return { bodies, template };
    }
    if (input.departmentId !== null || !sender.has('comms.messages.send_adhoc')) {
      throw refuse(
        'Choose an approved template. Only Communications may send words no template covers.',
      );
    }
    const bodies: Bodies = {};
    for (const lang of SMS_LANGS) {
      const body = input.bodies?.[lang]?.trim();
      if (body) bodies[lang] = body;
    }
    if (!Object.keys(bodies).length)
      throw unprocessable('Write the message in at least one language.');
    const unknown = Object.values(bodies)
      .flatMap((b) => blanksOf(b ?? ''))
      .filter((b) => !(b in BLANKS));
    if (unknown.length) throw unprocessable(`{{${unknown[0]}}} cannot be filled.`);
    for (const body of Object.values(bodies)) {
      if ((body ?? '').length > 918) throw unprocessable('Too long: at most six text messages.');
    }
    return { bodies, template: null };
  }

  /** One person's message, in their language if the words exist in it. */
  private render(
    r: Resolved,
    bodies: Bodies,
    defaultLang: SmsLang,
    common: Record<string, string>,
  ) {
    const lang: SmsLang = bodies[r.lang]
      ? r.lang
      : bodies[defaultLang]
        ? defaultLang
        : (SMS_LANGS.find((l) => bodies[l]) ?? defaultLang);
    if (r.status !== 'PENDING') return { ...r, lang, body: '', segments: 0, encoding: null };
    const body = renderSms(bodies[lang]!, lang, {
      ...common,
      first_name: firstNameOf(r.name),
      full_name: r.name,
    });
    const count = segments(body);
    return { ...r, lang, body, segments: count.segments, encoding: count.encoding };
  }

  /** A time in the future, or null for now. Refused if it is past or too far off. */
  private when(raw: string | null | undefined): Date | null {
    if (!raw) return null;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) throw unprocessable('That time cannot be read.');
    if (at.getTime() < Date.now() - 60_000) throw unprocessable('That time has already passed.');
    if (at.getTime() > Date.now() + 60 * 86_400_000) {
      throw unprocessable('Schedule at most sixty days ahead.');
    }
    return at.getTime() <= Date.now() + 60_000 ? null : at;
  }

  /** What the church has already committed to spending on that day, in its own timezone. */
  private async spentOn(tx: Tx, at: Date): Promise<bigint> {
    const church = await tx.church.findFirst();
    const tz = church?.timezone ?? 'Africa/Dar_es_Salaam';
    const rows = await tx.$queryRaw<{ total: string }[]>(
      sql`select coalesce(sum(cost), 0)::text as total from comms_messages
          where status <> 'CANCELLED'
            and (coalesce(scheduled_for, created_at) at time zone ${tz})::date
              = (${at}::timestamptz at time zone ${tz})::date`,
    );
    return toCents(rows[0]?.total ?? '0');
  }

  // ── Writing it down ───────────────────────────────────────────────────

  private async write(tx: Tx, p: Prepared, sender: Sender) {
    const pending = p.recipients.filter((r) => r.status === 'PENDING');
    const message = await tx.commsMessage.create({
      data: {
        departmentId: p.input.departmentId,
        audienceKey: p.input.audience.key,
        audienceParams: p.input.audience.params as object,
        audienceName: p.audienceName.slice(0, 200),
        templateId: p.template?.id ?? null,
        scheduleId: p.input.scheduleId ?? null,
        bodies: p.bodies as object,
        fields: p.fields,
        status: p.scheduledFor ? 'SCHEDULED' : 'SENDING',
        scheduledFor: p.scheduledFor,
        recipientCount: pending.length,
        skippedCount: p.recipients.length - pending.length,
        segments: p.segments,
        cost: fromCents(p.cost),
        createdById: p.input.scheduleId ? null : sender.userId,
      },
    });
    await tx.commsRecipient.createMany({
      data: p.recipients.map((r) => ({
        messageId: message.id,
        personId: r.personId,
        userId: r.userId,
        phone: r.phone,
        lang: r.lang,
        body: r.body,
        segments: r.segments,
        status: r.status,
        nextAttemptAt: p.scheduledFor ?? new Date(),
      })),
    });
    // Named by audience and template, never by a phone number.
    await this.audit.recordIn(tx, {
      action: p.scheduledFor ? 'comms.message.scheduled' : 'comms.message.sent',
      entityType: 'comms_message',
      entityId: message.id,
      summary:
        `${p.scheduledFor ? 'Scheduled' : 'Sent'} ${p.template ? `"${p.template.name}"` : 'a message'} to ${p.audienceName}` +
        (p.department ? ` for ${p.department.name}` : '') +
        `: ${pending.length} ${pending.length === 1 ? 'person' : 'people'}` +
        (message.skippedCount ? ` (${message.skippedCount} left alone)` : '') +
        `, ${tzs(p.cost)} TZS`,
    });
    return {
      id: message.id,
      recipientCount: pending.length,
      skippedCount: message.skippedCount,
      optedOut: p.recipients.filter((r) => r.status === 'SKIPPED_OPT_OUT').length,
      segments: p.segments,
      cost: fromCents(p.cost),
    };
  }

  /** The numbers the composer shows before the button does anything. */
  private describe(p: Prepared) {
    const by = (s: string) => p.recipients.filter((r) => r.status === s).length;
    const samples = SMS_LANGS.flatMap((lang) => {
      const first = p.recipients.find((r) => r.status === 'PENDING' && r.lang === lang);
      if (!first) return [];
      return [
        {
          lang,
          people: p.recipients.filter((r) => r.status === 'PENDING' && r.lang === lang).length,
          text: first.body,
          segments: first.segments,
          encoding: first.encoding,
        },
      ];
    });
    return {
      audienceName: p.audienceName,
      reach: by('PENDING'),
      leftAlone: {
        optedOut: by('SKIPPED_OPT_OUT'),
        noPhone: by('SKIPPED_NO_PHONE'),
        duplicate: by('SKIPPED_DUPLICATE'),
      },
      segments: p.segments,
      pricePerSegment: fromCents(p.price),
      cost: fromCents(p.cost),
      costText: `${tzs(p.cost)} TZS`,
      spentToday: fromCents(p.spentToday),
      dailyCap: p.dailyCap,
      scheduledFor: p.scheduledFor?.toISOString() ?? null,
      samples,
      problem: p.problem,
    };
  }
}

import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import {
  FIRST_STEP,
  LANGS,
  keysForStep,
  screenIds,
  stepById,
  t,
  UI,
  validateStep,
  type Lang,
  type Values,
} from '@irca/shared/registration';
import type { Registration } from '../../../generated/prisma/client.js';
import { Db, type TenantTx } from '../../../core/database/db.service.js';
import { RequestAuth } from '../../../core/context/request-auth.js';
import { AppError } from '../../../core/http/app-error.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { UsageService } from '../../../core/usage/usage.service.js';
import { columnsOf, dtoOf, valuesOf, type RegistrationDto } from './values.js';

/** What the form gets back from a Continue: where to go, or what is wrong. */
export type SaveResult = { ok: true; next: string } | { ok: false; error: string };

/**
 * The registration form's own back end.
 *
 * This is the first database's `registration.ts` and `actions.ts`, moved
 * behind the API and given a church. The rules are the same ones, in the same
 * order, and deliberately so: the form's behaviour is what the church has
 * tested on real Sundays, and this phase moves where the answers live, not
 * what the form does.
 *
 * Every write is a single statement that returns the row it wrote, because
 * Postgres runs every part of a statement against one snapshot: a CTE that
 * updates hands back the row as it was *before* the write, which is how this
 * went wrong the first time it was written.
 */
@Injectable()
export class PublicRegistrationService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
  ) {}

  /** A new registration, its token, and the Person the church will care for. */
  async create(rawLang: string): Promise<RegistrationDto> {
    const churchId = this.auth.requireChurch();
    const lang: Lang = (LANGS as readonly string[]).includes(rawLang) ? (rawLang as Lang) : 'en';

    const row = await this.db.tx(async (tx) => {
      const created = await tx.registration.create({
        data: { churchId, token: newToken(), lang, currentStep: FIRST_STEP },
      });
      // A registration is somebody, from the first tap: the office should see
      // them in the list even if they never finish.
      await tx.person.create({ data: { churchId, registrationId: created.id } });
      return created;
    });

    this.usage.inc('registrations.started');
    return dtoOf(row);
  }

  async byToken(token: string): Promise<RegistrationDto> {
    return dtoOf(await this.require(token));
  }

  /** Changing the language of a registration already under way. */
  async setLanguage(token: string, raw: string): Promise<void> {
    // An unrecognised value is ignored, not coerced. Falling back to English
    // would quietly move someone off the language they chose because a value
    // failed to parse, which is worse than doing nothing.
    if (!(LANGS as readonly string[]).includes(raw)) return;
    const churchId = this.auth.requireChurch();
    await this.db.client.registration.updateMany({
      where: { churchId, token },
      data: { lang: raw },
    });
  }

  /**
   * Writes one step's answers and says where to go next.
   *
   * The next screen is computed from the answers as they stand *after* this
   * save, so ticking "join the church" opens the membership path immediately
   * rather than one step late.
   */
  async saveStep(token: string, stepId: string, draft: Partial<Values>): Promise<SaveResult> {
    const registration = await this.require(token);
    if (registration.status === 'submitted') return { ok: true, next: 'done' };

    const step = stepById(stepId);
    if (!step) return { ok: false, error: 'Unknown step' };

    // Take only the keys this step owns. Editing "phone" from the review
    // screen must not be able to blank out a neighbouring answer.
    const patch = only(step ? keysForStep(step) : [], draft);
    const merged: Values = { ...valuesOf(registration), ...patch };
    const lang = registration.lang as Lang;

    const error = validateStep(step, merged, lang);
    if (error) return { ok: false, error };

    const ids = screenIds(merged);
    const next = ids[ids.indexOf(stepId) + 1] ?? 'done';

    // The screen they are about to see, not the one they just finished: the
    // question someone abandons on is the one they were looking at.
    const saved = await this.write(registration, patch, next, merged);
    if (saved === 'phone-taken') return { ok: false, error: t(UI.eTaken, lang) };
    if (!saved) return { ok: false, error: 'Registration not found' };

    // The last question sends it in. There is no review screen to press send
    // on any more, so the check every required step used to get there happens
    // here.
    if (next === 'done') {
      for (const id of ids) {
        const later = stepById(id);
        const problem = later && validateStep(later, merged, lang);
        if (problem) return { ok: false, error: problem };
      }
      await this.submit(token);
    }

    return { ok: true, next };
  }

  /**
   * Autosave for a question in progress.
   *
   * Continue saves a finished answer; this catches the half of one somebody
   * leaves behind when they put the phone down. It does not validate: a draft
   * is partial by definition, and a phone number with three digits in it so
   * far is exactly the thing worth keeping.
   */
  async saveDraft(token: string, stepId: string, values: Partial<Values>): Promise<void> {
    const step = stepById(stepId);
    if (!step) return;
    const registration = await this.find(token);
    // Nothing to draft onto a registration already sent in, or one that is not
    // this church's.
    if (!registration || registration.status === 'submitted') return;

    const patch = only(keysForStep(step), values);
    if (!Object.keys(patch).length) return;
    // The commonest failure here is the once-per-number index, hit while
    // someone types a number another visitor already registered. Continue
    // surfaces that properly; a draft should not shout about it.
    await this.write(registration, patch, stepId, { ...valuesOf(registration), ...patch });
  }

  /** Sends it in, re-checking every question they were actually shown. */
  async submit(token: string): Promise<RegistrationDto> {
    const churchId = this.auth.requireChurch();
    const registration = await this.require(token);
    if (registration.status === 'submitted') return dtoOf(registration);

    const values = valuesOf(registration);
    const lang = registration.lang as Lang;
    for (const id of screenIds(values)) {
      const step = stepById(id);
      const problem = step && validateStep(step, values, lang);
      if (problem) throw new AppError(422, ErrorCode.VALIDATION_FAILED, problem);
    }

    const row = await this.db.tx(async (tx) => {
      const sent = await tx.registration.update({
        where: { id: registration.id },
        data: { status: 'submitted', submittedAt: new Date(), currentStep: 'done' },
      });
      await this.syncPerson(tx, sent);
      // One line per registration, not per tap: a busy Sunday would bury the
      // log otherwise. There is no actor — the visitor is not a user here.
      await this.audit.recordIn(tx, {
        action: 'membership.registration.submitted',
        entityType: 'registration',
        entityId: sent.id,
        summary: `${sent.fullname || 'Someone'} finished the registration form`,
        churchId,
      });
      return sent;
    });

    this.usage.inc('registrations.submitted');
    return dtoOf(row);
  }

  /**
   * One write: the answers, where they are now, and how far they ever got.
   * Returns 'phone-taken' when the once-per-number index refuses it.
   */
  private async write(
    registration: Registration,
    patch: Partial<Values>,
    step: string | null,
    merged: Values,
  ): Promise<Registration | 'phone-taken' | null> {
    try {
      return await this.db.tx(async (tx) => {
        const saved = await tx.registration.update({
          where: { id: registration.id, status: 'in_progress' },
          data: {
            ...columnsOf(patch),
            currentStep: step,
            furthestStep: furthest(step, registration.furthestStep, merged),
          },
        });
        await this.syncPerson(tx, saved);
        return saved;
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      // registrations_phone_idx: someone already registered with this number.
      if (code === 'P2002') return 'phone-taken';
      // P2025: the row moved to submitted between the read and the write.
      if (code === 'P2025') return null;
      throw err;
    }
  }

  /**
   * The church's record of the person follows what they typed, while the two
   * are linked. The office may correct a name on the person; that is why the
   * copy is one-way and only from the form's own fields.
   */
  private async syncPerson(tx: TenantTx, row: Registration): Promise<void> {
    await tx.person.updateMany({
      where: { churchId: row.churchId, registrationId: row.id },
      data: {
        fullName: row.fullname.slice(0, 120),
        gender: row.gender.slice(0, 20),
        ageGroup: row.age.slice(0, 20),
        dial: row.dial.slice(0, 6),
        phone: row.phone.slice(0, 20),
        email: row.email.slice(0, 254),
      },
    });
  }

  private async find(token: string): Promise<Registration | null> {
    const churchId = this.auth.requireChurch();
    if (!/^[a-f0-9]{32}$/.test(token)) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'That is not a registration link.');
    }
    return this.db.client.registration.findFirst({ where: { churchId, token } });
  }

  private async require(token: string): Promise<Registration> {
    const row = await this.find(token);
    if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'Registration not found');
    return row;
  }
}

/** 32 hex chars from a CSPRNG — this is the only thing guarding the row. */
const newToken = () => randomBytes(16).toString('hex');

/** Only the keys this step owns, and only those the caller actually sent. */
function only(keys: readonly (keyof Values)[], draft: Partial<Values>): Partial<Values> {
  const patch: Partial<Values> = {};
  for (const key of keys) {
    if (key in draft) (patch as Record<string, unknown>)[key] = draft[key];
  }
  return patch;
}

/**
 * The deepest step reached so far.
 *
 * It only ever moves forwards: walking back to change an answer is not giving
 * up, and a drop-off figure measured off the current step would report it as
 * though it were.
 */
function furthest(step: string | null, soFar: string | null, merged: Values): string | null {
  if (!step) return soFar;
  if (!soFar) return step;

  const order = screenIds(merged);
  const now = order.indexOf(step);
  const before = order.indexOf(soFar);

  // A step that is no longer on their path (a branch they backed out of) has
  // no index here, so the one we can place wins.
  if (before < 0) return step;
  if (now < 0) return soFar;
  return now > before ? step : soFar;
}

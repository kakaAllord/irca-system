import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { ErrorCode, type SmsLang } from '@irca/shared';
import type { Tx } from '../database/db.service.js';
import { AppError } from '../http/app-error.js';

/** One person an audience reaches, as the module that knows them sees them. */
export type AudienceMember = {
  personId?: string;
  userId?: string;
  name: string;
  /** As recorded: the dialling code and the rest. Turned into E.164 by the resolver. */
  dial: string;
  phone: string;
  /** Theirs, if known. Otherwise the church's default. */
  lang?: string | null;
  /** They asked, on their record, not to be messaged. */
  optedOut: boolean;
  /**
   * Blanks only this audience knows, for this person, written for a text in
   * the language they will be sent: {{balance}} as "150,000 TZS".
   */
  blanks?: (lang: SmsLang) => Record<string, string>;
};

/**
 * A group of people a message can go to, belonging to the module that knows
 * who they are. Communications never imports a department, Membership or
 * anything else: each registers its own audiences here as it starts, the
 * way change-request handlers do.
 */
export interface AudienceProvider<P = unknown> {
  /** 'church.people', 'departments.everyone'. Stored on every message. */
  readonly key: string;
  /** What a person choosing it reads: 'Everyone in People'. */
  readonly label: string;
  readonly description: string;
  /**
   * 'church': reaches beyond any one department, so Communications uses it
   * and a department only once granted. 'department': a department's own
   * people, which its leaders can always reach — but only their own.
   */
  readonly scope: 'church' | 'department';
  /**
   * It reminds people about the same thing again and again, so nobody in it
   * is sent another message from it within Communications' cooldown
   * (comms.personCooldownDays), whoever sends and with whatever parameters:
   * two campaigns reminding on the same Monday are one text, not two.
   */
  readonly cooldown?: boolean;
  /**
   * Being in it says something private (that someone owes on a pledge), so
   * who a message to it reached — their names in its history, a named
   * sample in the composer — is shown only to holders of this permission.
   * Others see the counts and the words as written.
   */
  readonly readPermission?: string;
  /** The audience blanks it fills for each person ({{balance}}), if any. */
  readonly fills?: readonly string[];
  /** Its parameters, checked before anything else is done with them. */
  readonly params: z.ZodType<P>;
  /** The departments these parameters name, for a 'department' audience. */
  departmentsOf?(params: P): string[] | 'all';
  /** Its name for these parameters, as the history will show it. Refuses unknown ids. */
  describe(tx: Tx, params: P): Promise<string>;
  /** Who is in it, right now. Never stored as a copy (07 step 7.8). */
  resolve(tx: Tx, params: P): Promise<AudienceMember[]>;
}

@Injectable()
export class AudienceRegistry {
  private readonly providers = new Map<string, AudienceProvider>();

  register<P>(provider: AudienceProvider<P>): void {
    this.providers.set(provider.key, provider as AudienceProvider);
  }

  all(): AudienceProvider[] {
    return [...this.providers.values()];
  }

  find(key: string): AudienceProvider | undefined {
    return this.providers.get(key);
  }

  require(key: string): AudienceProvider {
    const provider = this.providers.get(key);
    if (!provider) throw new AppError(404, ErrorCode.NOT_FOUND, 'There is no such audience.');
    return provider;
  }

  /** The provider and its parameters, checked. */
  parse(key: string, raw: unknown): { provider: AudienceProvider; params: unknown } {
    const provider = this.require(key);
    const parsed = provider.params.safeParse(raw ?? {});
    if (!parsed.success) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        'That audience needs choosing properly.',
        {
          audience: parsed.error.issues.map((i) => i.message),
        },
      );
    }
    return { provider, params: parsed.data };
  }
}

/** "Neema" from "Neema Mollel", for {{first_name}}. */
export const firstNameOf = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? '';

import { randomBytes } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify, type Options } from '@node-rs/argon2';
import { PASSWORD_MAX, PASSWORD_MIN } from '@irca/shared';
import { COMMON_PASSWORDS_TEXT } from './common-passwords.js';

// Argon2id, which @node-rs/argon2 declares as a const enum (Algorithm.Argon2id
// = 2). Const enums cannot be read under isolatedModules, so the value is
// written out.
const ARGON2ID = 2;

// OWASP's recommended argon2id settings: 19 MiB, two passes, one lane.
const OPTIONS: Options = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

const COMMON = new Set(COMMON_PASSWORDS_TEXT.split('\n'));

// Obvious to anyone who knows the church, and in no breach list.
const LOCAL_OBVIOUS = [
  'irca123456',
  'irca2026irca',
  'ircaarusha',
  'arusha12345',
  'arusha2026',
  'jesus12345',
  'jesusislord',
  'church1234',
  'church12345',
  'password12',
  'tanzania123',
  'mungumwema',
];
for (const p of LOCAL_OBVIOUS) COMMON.add(p);

export type PolicyProblem = 'too_short' | 'too_long' | 'too_common';

@Injectable()
export class PasswordService implements OnModuleInit {
  /**
   * A real hash of a random string. Checking a sign-in for an unknown email
   * against it makes "no such account" take as long as "wrong password", so
   * response time does not reveal which emails have accounts.
   */
  private dummyHash = '';

  async onModuleInit() {
    this.dummyHash = await hash(randomBytes(16).toString('hex'), OPTIONS);
  }

  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  /** False for a null hash (no password set yet), after the same amount of work. */
  async verify(stored: string | null, plain: string): Promise<boolean> {
    if (!stored) {
      await verify(this.dummyHash, plain).catch(() => false);
      return false;
    }
    return verify(stored, plain).catch(() => false);
  }

  /** True when the hash was made with weaker settings than today's, so it should be redone. */
  needsRehash(stored: string): boolean {
    const m = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored);
    if (!m) return true;
    const [, mem, time, par] = m.map(Number);
    return mem! < OPTIONS.memoryCost! || time! < OPTIONS.timeCost! || par! !== OPTIONS.parallelism;
  }

  /** The policy for setting a password. Sign-in never applies it. */
  check(plain: string): PolicyProblem | null {
    if (plain.length < PASSWORD_MIN) return 'too_short';
    if (plain.length > PASSWORD_MAX) return 'too_long';
    if (COMMON.has(plain.toLowerCase())) return 'too_common';
    return null;
  }
}

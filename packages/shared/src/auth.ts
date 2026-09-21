import { z } from 'zod';
import type { NavItem } from './rbac/define';

/** Emails are stored and compared trimmed and lowercased: `Neema@X.com ` is neema@x.com. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Length is what makes a password strong (NIST SP 800-63B), so the rule is a
 * minimum length and nothing else: no "must contain a symbol". The API also
 * refuses passwords found in breach lists; that list is too large to ship to
 * browsers, so only the API checks it.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`);

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254)),
  // No policy check on sign-in: a password set under older rules must still work.
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/** "Neema Mollel" → "NM"; one name → its first two letters. Shown in avatars. */
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

export type MeUser = {
  id: string;
  email: string;
  fullName: string;
  initials: string;
  platformRole: 'NONE' | 'DEV';
};

export type MeChurch = {
  id: string;
  code: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
};

/**
 * Everything the portal needs to draw itself for the signed-in person. Phase 2
 * fills permissions, modules and role labels, and the impersonation block.
 */
export type MeResponse = {
  user: MeUser;
  church: MeChurch | null;
  /** Every church this person can switch to. */
  churches: { id: string; name: string }[];
  permissions: string[];
  /** Portals this person can open, with only the pages they may see. */
  modules: { key: string; name: string; home: string; nav: NavItem[] }[];
  roleLabels: string[];
  impersonation: null | {
    id: string;
    actor: { id: string; fullName: string };
    startedAt: string;
    expiresAt: string;
  };
};

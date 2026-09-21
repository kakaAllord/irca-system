import { z } from 'zod';

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

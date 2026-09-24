import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive().default(4000),
    /** Everything the app does, as irca_app. */
    DATABASE_URL: z.url(),
    /** Feature code while viewing as someone, as irca_readonly: reads only. */
    DATABASE_URL_READONLY: z.url(),
    DIRECT_DATABASE_URL: z.url(),
    PORTAL_ORIGIN: z.url(),
    /** Where the registration form lives, for the links the office sends. */
    REGISTRATION_ORIGIN: z.url().default('http://localhost:3001'),
    SESSION_COOKIE_NAME: z.string().min(1),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive(),
    SESSION_IDLE_HOURS: z.coerce.number().int().positive(),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    /** How many recent log lines the dev console can read back. */
    LOG_BUFFER_LINES: z.coerce.number().int().min(0).max(20_000).default(2_000),

    /** 'log' prints emails, 'memory' keeps them for tests, 'resend' sends them. */
    EMAIL_PROVIDER: z.enum(['log', 'memory', 'resend']).default('log'),
    EMAIL_FROM: z.string().default('IRCA Admin <no-reply@example.invalid>'),
    RESEND_API_KEY: z.string().optional(),

    /**
     * Seals the Beem key and secret in the database (D26): 32 bytes, base64.
     * Without it, a Beem account cannot be saved, and messages go to the log.
     * Never the Beem key itself, which lives only in the database.
     */
    BEEM_SETTINGS_KEY: z
      .string()
      .optional()
      .transform((v) => v || undefined)
      .refine((v) => v === undefined || Buffer.from(v, 'base64').length === 32, {
        message: 'must be 32 bytes, base64 (see .env.example for how to make one)',
      }),
    /**
     * The password Beem uses when it calls us with a reply: part of the
     * callback URL given to Beem, since Beem sends no signature of its own.
     */
    BEEM_INBOUND_SECRET: z
      .string()
      .optional()
      .transform((v) => v || undefined)
      .refine((v) => v === undefined || v.length >= 24, {
        message: 'must be at least 24 characters',
      }),
  })
  .refine((env) => env.EMAIL_PROVIDER !== 'resend' || !!env.RESEND_API_KEY, {
    message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is resend',
    path: ['RESEND_API_KEY'],
  })
  // Browsers accept a __Host- cookie only from this exact host, over HTTPS,
  // for every path, so a neighbouring subdomain cannot plant a session.
  .refine((env) => env.NODE_ENV !== 'production' || env.SESSION_COOKIE_NAME.startsWith('__Host-'), {
    message: 'SESSION_COOKIE_NAME must start with __Host- in production',
    path: ['SESSION_COOKIE_NAME'],
  })
  .refine((env) => env.EMAIL_PROVIDER !== 'memory' || env.NODE_ENV === 'test', {
    message: 'EMAIL_PROVIDER=memory is only for tests',
    path: ['EMAIL_PROVIDER'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Every problem at once, so fixing .env is one round trip rather than five.
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

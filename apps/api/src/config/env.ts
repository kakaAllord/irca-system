import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url(),
    DATABASE_URL_CORE: z.url(),
    DATABASE_URL_READONLY: z.url(),
    DIRECT_DATABASE_URL: z.url(),
    PORTAL_ORIGIN: z.url(),
    SESSION_COOKIE_NAME: z.string().min(1),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive(),
    SESSION_IDLE_HOURS: z.coerce.number().int().positive(),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

    /** 'log' prints emails, 'memory' keeps them for tests, 'resend' sends them. */
    EMAIL_PROVIDER: z.enum(['log', 'memory', 'resend']).default('log'),
    EMAIL_FROM: z.string().default('IRCA Admin <no-reply@example.invalid>'),
    RESEND_API_KEY: z.string().optional(),
  })
  .refine((env) => env.EMAIL_PROVIDER !== 'resend' || !!env.RESEND_API_KEY, {
    message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is resend',
    path: ['RESEND_API_KEY'],
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

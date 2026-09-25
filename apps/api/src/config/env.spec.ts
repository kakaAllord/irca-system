import { validateEnv } from './env.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://irca_app:x@localhost:5432/irca_dev',
  DATABASE_URL_READONLY: 'postgresql://irca_readonly:x@localhost:5432/irca_dev',
  DIRECT_DATABASE_URL: 'postgresql://irca_owner:x@localhost:5432/irca_dev',
  PORTAL_ORIGIN: 'http://localhost:3000',
  SESSION_COOKIE_NAME: 'irca_session',
  SESSION_ABSOLUTE_HOURS: '168',
  SESSION_IDLE_HOURS: '12',
};

describe('validateEnv', () => {
  it('accepts a complete environment and applies defaults', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.SESSION_IDLE_HOURS).toBe(12);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('names every missing or invalid variable at once', () => {
    const { PORTAL_ORIGIN: _o, DATABASE_URL_READONLY: _r, ...rest } = valid;
    expect(() => validateEnv({ ...rest, SESSION_IDLE_HOURS: 'soon' })).toThrow(
      /PORTAL_ORIGIN[\s\S]*DATABASE_URL_READONLY|DATABASE_URL_READONLY[\s\S]*PORTAL_ORIGIN/,
    );
    expect(() => validateEnv({ ...rest, SESSION_IDLE_HOURS: 'soon' })).toThrow(
      /SESSION_IDLE_HOURS/,
    );
  });

  it('refuses a production session cookie without the __Host- prefix', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/__Host-/);
    expect(() =>
      validateEnv({ ...valid, NODE_ENV: 'production', SESSION_COOKIE_NAME: '__Host-irca_session' }),
    ).not.toThrow();
  });

  it('takes file storage whole or not at all', () => {
    const storage = {
      STORAGE_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      STORAGE_REGION: 'auto',
      STORAGE_BUCKET: 'irca-files',
      STORAGE_ACCESS_KEY: 'key',
      STORAGE_SECRET_KEY: 'secret',
    };
    expect(validateEnv({ ...valid, ...storage }).STORAGE_BUCKET).toBe('irca-files');
    // Empty, as .env.example leaves them, is none.
    const none = validateEnv({ ...valid, STORAGE_ENDPOINT: '', STORAGE_BUCKET: '' });
    expect(none.STORAGE_ENDPOINT).toBeUndefined();
    const { STORAGE_SECRET_KEY: _s, ...partial } = storage;
    expect(() => validateEnv({ ...valid, ...partial })).toThrow(/all five STORAGE_/);
  });
});

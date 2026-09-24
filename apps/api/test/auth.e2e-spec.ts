import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import {
  createApp,
  createChurch,
  createUser,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

describe('signing in and out', () => {
  let app: NestExpressApplication;
  let db: pg.Client;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(() => truncateAll(db));

  const login = (email: string, password: string, ip?: string) =>
    portal(app, ip).post('/v1/auth/login', { email, password });

  it('signs in with the right password and sets a safe cookie', async () => {
    await createChurch(db);
    const u = await createUser(db);
    const res = await login(u.email, u.password).expect(200);

    expect(res.body.user.email).toBe(u.email);
    expect(res.body.church.code).toBe('IRCA');
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
  });

  it('ignores case and surrounding spaces in the email', async () => {
    const u = await createUser(db, { email: 'neema@example.com' });
    await login('  NEEMA@Example.com ', u.password).expect(200);
  });

  it('gives the same answer for a wrong password, an unknown email and a disabled account', async () => {
    const u = await createUser(db);
    const disabled = await createUser(db, { status: 'DISABLED' });

    const wrong = await login(u.email, 'not the password').expect(401);
    const unknown = await login('nobody@example.com', 'whatever it is').expect(401);
    const off = await login(disabled.email, disabled.password).expect(401);

    for (const res of [wrong, unknown, off]) {
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    }
  });

  it('locks an account after five failures, even against the right password, for fifteen minutes', async () => {
    const u = await createUser(db);
    for (let i = 0; i < 5; i++) await login(u.email, 'wrong password').expect(401);

    const locked = await login(u.email, u.password).expect(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');

    await db.query(`update users set locked_until = now() - interval '1 minute' where id = $1`, [
      u.id,
    ]);
    await login(u.email, u.password).expect(200);
  });

  it('limits sign-in attempts from one address', async () => {
    const u = await createUser(db);
    for (let i = 0; i < 10; i++) await login(u.email, 'wrong password', '10.9.9.9');
    const res = await login(u.email, u.password, '10.9.9.9').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('limits forgot-password requests from one address, five per fifteen minutes', async () => {
    const forgot = () =>
      portal(app, '10.9.9.10').post('/v1/auth/forgot-password', { email: 'nobody@example.com' });
    for (let i = 0; i < 5; i++) await forgot().expect(202);
    await forgot().expect(429);
  });

  it('limits reset-password attempts from one address, ten per fifteen minutes', async () => {
    const reset = () =>
      portal(app, '10.9.9.11').post('/v1/auth/reset-password', {
        token: 'not-a-real-token',
        password: 'kilimanjaro sunrise tea',
      });
    // The token is wrong every time, so each call fails on its own before the
    // eleventh ever reaches the handler.
    for (let i = 0; i < 10; i++) await reset().expect(410);
    await reset().expect(429);
  });

  it('knows who is signed in, and forgets them after sign-out', async () => {
    const u = await createUser(db);
    await portal(app).get('/v1/auth/me').expect(401);

    const cookie = sessionCookie(await login(u.email, u.password).expect(200));
    const me = await portal(app).get('/v1/auth/me', cookie).expect(200);
    expect(me.body.user.id).toBe(u.id);

    await portal(app).post('/v1/auth/logout', {}, cookie).expect(204);
    await portal(app).get('/v1/auth/me', cookie).expect(401);
  });

  it('signs out every older session when the password changes', async () => {
    const u = await createUser(db);
    const cookie = sessionCookie(await login(u.email, u.password).expect(200));
    await db.query(
      `update users set password_changed_at = now() + interval '1 second' where id = $1`,
      [u.id],
    );
    await portal(app).get('/v1/auth/me', cookie).expect(401);
  });

  it('ends a session left unused past the idle limit', async () => {
    const u = await createUser(db);
    const cookie = sessionCookie(await login(u.email, u.password).expect(200));
    await db.query(`update sessions set last_seen_at = now() - interval '13 hours'`);
    await portal(app).get('/v1/auth/me', cookie).expect(401);
  });

  it('refuses writes without the portal header, or from another origin', async () => {
    const server = request(app.getHttpServer());
    const noHeader = await server.post('/v1/auth/logout').expect(403);
    expect(noHeader.body.error.code).toBe('CSRF_REJECTED');
    const evil = await server
      .post('/v1/auth/logout')
      .set('X-IRCA-Client', 'portal')
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(evil.body.error.code).toBe('CSRF_REJECTED');
  });

  it('stores times as the database clock sees them', async () => {
    // Prisma's pg adapter sends timestamps without a zone, so a connection whose
    // time zone is not UTC stores every time hours off. The runtime roles are
    // set to UTC (plan step 1.5); this catches a role that is not.
    const u = await createUser(db);
    await login(u.email, u.password).expect(200);
    const { rows } = await db.query(
      `select abs(extract(epoch from (created_at - now()))) as drift from sessions`,
    );
    expect(Number(rows[0].drift)).toBeLessThan(60);
  });

  it('tells every cache not to keep an answer, signed in or not', async () => {
    const u = await createUser(db);
    const cookie = sessionCookie(
      await portal(app)
        .post('/v1/auth/login', { email: u.email, password: u.password })
        .expect(200),
    );
    for (const res of [
      await portal(app).get('/v1/auth/me', cookie).expect(200),
      await portal(app).get('/v1/auth/me').expect(401),
    ]) {
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
  });

  it('answers with the safe headers, says nothing about itself, and allows no other site', async () => {
    const res = await portal(app)
      .get('/v1/auth/me')
      .set('Origin', 'https://elsewhere.example')
      .expect(401);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('stores only a hash of the session token', async () => {
    const u = await createUser(db);
    const cookie = sessionCookie(await login(u.email, u.password).expect(200));
    const token = cookie.split('=')[1]!;
    const { rows } = await db.query(`select * from sessions`);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('gives every error the one shape, with a request id', async () => {
    const res = await portal(app).get('/v1/no-such-thing').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
      requestId: res.headers['x-request-id'],
    });
  });
});

import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();
  beforeAll(() => service.onModuleInit());

  it('verifies what it hashed, and nothing else', async () => {
    const h = await service.hash('correct horse battery');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(h, 'correct horse battery')).toBe(true);
    expect(await service.verify(h, 'wrong horse battery')).toBe(false);
  });

  it('treats a missing hash as a wrong password, after doing the same work', async () => {
    const h = await service.hash('something long');
    const t0 = performance.now();
    await service.verify(h, 'not it at all');
    const real = performance.now() - t0;
    const t1 = performance.now();
    expect(await service.verify(null, 'anything')).toBe(false);
    const dummy = performance.now() - t1;
    expect(dummy).toBeGreaterThan(real / 3);
  });

  it('asks for a rehash only when settings were weaker', async () => {
    expect(service.needsRehash(await service.hash('abcdefghijk'))).toBe(false);
    expect(service.needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdA$aGFzaA')).toBe(true);
    expect(service.needsRehash('$2b$10$bcrypt-hash')).toBe(true);
  });

  it('applies the length-first policy', () => {
    expect(service.check('a'.repeat(9))).toBe('too_short');
    expect(service.check('a'.repeat(129))).toBe('too_long');
    expect(service.check('Password123')).toBe('too_common');
    expect(service.check('JesusIsLord')).toBe('too_common');
    expect(service.check('kilimanjaro sunrise tea')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { initialsOf, LoginSchema, normalizeEmail, PasswordSchema } from './auth';

describe('auth helpers', () => {
  it('normalises emails', () => {
    expect(normalizeEmail('  Neema@Example.COM ')).toBe('neema@example.com');
    expect(LoginSchema.parse({ email: ' DEV@irca.local ', password: 'x' }).email).toBe(
      'dev@irca.local',
    );
  });

  it('needs a password to sign in, but no policy', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
  });

  it('applies the length rule when a password is set', () => {
    expect(PasswordSchema.safeParse('a'.repeat(9)).success).toBe(false);
    expect(PasswordSchema.safeParse('a'.repeat(10)).success).toBe(true);
    expect(PasswordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('makes initials', () => {
    expect(initialsOf('Neema Mollel')).toBe('NM');
    expect(initialsOf('Kaka Allord Mushi')).toBe('KM');
    expect(initialsOf('neema')).toBe('NE');
    expect(initialsOf('  ')).toBe('?');
  });
});

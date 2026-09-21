import { describe, expect, it } from 'vitest';
import { defineModule } from '../rbac/define';
import { ALL_MODULES, ALL_PERMISSIONS, CHURCH_MODULES, permissionKind } from './index';

describe('module definitions', () => {
  it('refuses a permission belonging to another module', () => {
    expect(() =>
      defineModule({
        key: 'finance',
        name: 'F',
        description: '',
        kind: 'department',
        home: '/f',
        permissions: { 'membership.people.read': { kind: 'read', label: 'x' } },
        systemRoles: [],
        nav: [],
      }),
    ).toThrow(/does not belong to module finance/);
  });

  it('refuses a role or nav item using a permission that does not exist', () => {
    const base = {
      key: 'f',
      name: 'F',
      description: '',
      kind: 'department' as const,
      home: '/f',
      permissions: { 'f.a.read': { kind: 'read' as const, label: 'x' } },
    };
    expect(() =>
      defineModule({
        ...base,
        systemRoles: [{ key: 'f.r', name: 'R', description: '', permissions: ['f.b.read'] }],
        nav: [],
      }),
    ).toThrow(/unknown permission f.b.read/);
    expect(() =>
      defineModule({
        ...base,
        systemRoles: [],
        nav: [{ label: 'A', href: '/f', mark: 'F', permission: 'f.b.read' }],
      }),
    ).toThrow(/unknown permission f.b.read/);
  });

  it('keeps permission and role keys unique across modules', () => {
    const permissions = ALL_MODULES.flatMap((m) => Object.keys(m.permissions));
    expect(new Set(permissions).size).toBe(permissions.length);
    const roles = ALL_MODULES.flatMap((m) => m.systemRoles.map((r) => r.key));
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('marks each permission as read or write', () => {
    for (const key of Object.keys(ALL_PERMISSIONS)) {
      expect(permissionKind(key)).toMatch(/^(read|write)$/);
    }
    expect(permissionKind('admin.users.read')).toBe('read');
    expect(permissionKind('admin.users.invite')).toBe('write');
  });

  it('has exactly one core church module, admin', () => {
    expect(CHURCH_MODULES.filter((m) => m.kind === 'core').map((m) => m.key)).toEqual(['admin']);
  });
});

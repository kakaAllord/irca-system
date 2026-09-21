import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'irca:permissions';
export const WRITE_WITH_READ_KEY = 'irca:write-with-read';
/** Routes a church's own app (the registration form) calls with its key. */
export const PUBLIC_CLIENT_KEY = 'irca:public-client';

export type PermissionRule = { all: string[]; any?: never } | { any: string[]; all?: never };

/** The request must hold all of these. */
export const RequirePermission = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, { all: keys });

/** The request must hold at least one of these. */
export const RequireAnyPermission = (...keys: string[]) =>
  SetMetadata(PERMISSIONS_KEY, { any: keys });

/**
 * A route a church's own app calls with its key, not a person's session: the
 * registration form. The kind is checked against the key, so a key made for
 * the form cannot be used anywhere else.
 */
export const PublicClient = (kind: 'REGISTRATION') => SetMetadata(PUBLIC_CLIENT_KEY, kind);

/**
 * For the rare write route that legitimately needs only a read permission,
 * such as starting an impersonation, which changes nothing but the actor's own
 * session. The reason is required, so review sees why.
 */
export const WriteWithReadPermission = (reason: string) => SetMetadata(WRITE_WITH_READ_KEY, reason);

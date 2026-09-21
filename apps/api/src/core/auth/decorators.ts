import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'irca:public';
export const AUTHENTICATED_ONLY = 'irca:authenticated-only';

/** No session needed: sign-in, health, accepting an invitation. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * A session is needed but no particular permission: /me, sign-out. Phase 2's
 * permission guard reads this, and refuses any route that declares neither
 * this, @Public nor a permission.
 */
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY, true);

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

export const CALLED_BY_PROVIDER = 'irca:called-by-provider';

/**
 * Called by an outside service (Beem passing on a reply), never by a
 * browser: no cookie is read, so there is no session to forge, and the CSRF
 * header check does not apply. The route must prove the caller itself, with
 * a secret of its own. Always used with @Public().
 */
export const CalledByProvider = () => SetMetadata(CALLED_BY_PROVIDER, true);

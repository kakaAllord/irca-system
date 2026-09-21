import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_IMPERSONATING = 'irca:allow-while-impersonating';

/**
 * Lets a write route run during an impersonation. Exactly two handlers may use
 * it, stopping the impersonation and signing out, and a test asserts that list,
 * so a third one needs a deliberate change and a reviewer.
 */
export const AllowWhileImpersonating = () => SetMetadata(ALLOW_WHILE_IMPERSONATING, true);

import { createHash, randomBytes } from 'node:crypto';

/** 256 random bits, safe in a cookie or a URL. */
export const newToken = () => randomBytes(32).toString('base64url');

/** What the database keeps instead of a token, so a leaked table leaks no live sessions. */
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

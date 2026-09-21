/**
 * Where to go after sign-in, given a ?next= value from the URL.
 *
 * Only a path on this site: it must start with a single "/" and not "//" or
 * "/\" (which browsers treat as another host). Anything else goes home, so the
 * sign-in page cannot be used to send people to another site.
 */
export function safeNext(next: string | string[] | null | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return '/';
  return value;
}

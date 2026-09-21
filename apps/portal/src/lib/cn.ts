/** Joins class names, dropping empty ones. */
export const cn = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

/**
 * Values that came from a JSON column, a query string or a form arrive as
 * unknown. Comparing and printing them goes through here, so an object never
 * becomes the string "[object Object]" in a comparison or in a CSV cell.
 */
export function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return value.toString();
  }
  return JSON.stringify(value) ?? '';
}

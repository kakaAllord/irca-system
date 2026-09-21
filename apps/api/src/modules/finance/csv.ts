import { text } from '../../core/values.js';

/**
 * CSV a spreadsheet opens without turning into a program.
 *
 * A cell starting with =, +, -, @, tab or carriage return is run as a formula
 * by Excel and Sheets. Notes are typed by people, so any of them can start
 * that way by accident or on purpose; an apostrophe in front makes it text
 * again (OWASP calls this CSV injection).
 */
const DANGEROUS = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  const cell = text(value);
  const safe = DANGEROUS.test(cell) ? `'${cell}` : cell;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(',');

export function csv(head: string[], rows: unknown[][]): string {
  return [csvRow(head), ...rows.map(csvRow)].join('\r\n');
}

/** IRCA-finance-2026-09-01-to-2026-09-30.csv */
export const csvFilename = (churchCode: string, what: string, from?: string, to?: string) =>
  [churchCode, what, from && `${from}-to-${to}`].filter(Boolean).join('-') + '.csv';

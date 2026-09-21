'use client';

import { useId } from 'react';
import { Button, type ButtonProps } from './Button';

/**
 * A submit button that says why it cannot be pressed.
 *
 * A greyed-out button with no explanation makes people hunt the form for
 * whatever they missed. This one lists what is still needed, on hover and to
 * a screen reader, and the list is the same one the form checks, so the two
 * cannot disagree.
 *
 * The title sits on a wrapper rather than the button: a disabled control does
 * not always fire the events a tooltip needs.
 */
export function SubmitButton({
  missing = [],
  children,
  disabled,
  ...rest
}: ButtonProps & {
  /** What is still needed, in the words of the labels: ['Email', 'Full name']. */
  missing?: string[];
}) {
  const id = useId();
  const why = missing.length ? `Still needed: ${list(missing)}` : undefined;

  return (
    <span className="inline-flex" title={why}>
      <Button
        {...rest}
        disabled={disabled || missing.length > 0}
        aria-describedby={why ? id : undefined}
      >
        {children}
      </Button>
      {why && (
        <span id={id} className="sr-only">
          {why}
        </span>
      )}
    </span>
  );
}

/** "Email, Full name and a role" reads better than a bare comma list. */
function list(items: string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

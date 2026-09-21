import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Rendered inside the field, on the right (e.g. a show/hide button). */
  trailing?: ReactNode;
};

/**
 * A text field with a real <label>, and with its hint and error announced to
 * screen readers through aria-describedby. Every form in the portal uses it,
 * so no field is ever unlabelled.
 */
export function Input({ label, hint, error, trailing, className, id, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[12px] font-medium text-fg2">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={cn(
            'h-9 w-full rounded-[7px] border bg-input px-3 text-[13px] text-fg placeholder:text-fg3',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-br',
            error ? 'border-danger' : 'border-border',
            trailing ? 'pr-16' : '',
            className,
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-[11.5px] text-fg3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[11.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

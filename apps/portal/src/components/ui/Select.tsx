import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  /** Filter selects show their label inside, to keep a filter bar compact. */
  inline?: boolean;
  options: { value: string; label: string }[];
};

export function Select({ label, inline, options, className, id, value, ...rest }: SelectProps) {
  const auto = useId();
  const selectId = id ?? auto;
  const active = inline && value !== 'any' && value !== '';
  return (
    <div className={cn('flex flex-col gap-1.5', inline && 'gap-0')}>
      <label
        htmlFor={selectId}
        className={cn('text-[12px] font-medium text-fg2', inline && 'sr-only')}
      >
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        className={cn(
          'h-9 rounded-[7px] border bg-input px-2.5 text-[12px] text-fg',
          'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-br',
          active ? 'border-accent-br bg-chip text-fg' : 'border-border',
          className,
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {inline && !active ? `${label}: ${o.label}` : o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

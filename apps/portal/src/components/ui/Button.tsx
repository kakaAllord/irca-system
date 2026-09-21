import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-btn-bg text-btn-fg hover:opacity-90',
  secondary: 'border border-border bg-transparent text-fg hover:bg-hover',
  ghost: 'bg-transparent text-fg2 hover:bg-hover hover:text-fg',
  danger: 'bg-danger text-surface hover:opacity-90',
};
const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[11.5px]',
  md: 'h-9 px-3.5 text-[12.5px]',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Disables the button and shows a spinner, keeping its label for screen readers. */
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[7px] font-medium transition-opacity',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

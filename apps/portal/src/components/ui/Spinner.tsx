import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none',
        className,
      )}
    />
  );
}

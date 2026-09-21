import Image from 'next/image';
import light from '../../public/logo/irca.webp';
import dark from '../../public/logo/irca-dark.webp';
import { cn } from '@/lib/cn';

/**
 * The church's mark.
 *
 * Imported as a static asset so next/image knows its dimensions and reserves
 * the space: no reflow when it lands. Two files, not one: the mark's lettering
 * is near-black and disappears on the dark panel, so the dark theme gets a
 * copy with the lettering lifted (see scripts/logo.mjs). The name is written
 * beside it wherever this is used, so the image itself says nothing to a
 * screen reader.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const common = { alt: '', width: size, height: size, priority: true, sizes: `${size}px` };
  return (
    <span className={cn('block shrink-0', className)} style={{ width: size, height: size }}>
      <Image {...common} src={light} className="block dark:hidden" />
      <Image {...common} src={dark} className="hidden dark:block" />
    </span>
  );
}

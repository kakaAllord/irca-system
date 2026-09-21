import Image from 'next/image';
import logo from '../../public/logo/irca.webp';

/**
 * The church mark. Imported as a static asset so next/image knows its
 * dimensions at build time and reserves the space — no reflow when it lands,
 * which matters on the first screen where it sits above the heading.
 *
 * The source has been trimmed and flattened onto the paper colour
 * (scripts/optimise-logo.mjs), so it needs no plate behind it.
 */
export function Logo({ size = 104 }: { size?: number }) {
  return (
    <Image
      src={logo}
      alt="IRCA, International Revival Church Arusha"
      width={size}
      height={size}
      priority
      sizes={`${size}px`}
      style={{ display: 'block' }}
    />
  );
}

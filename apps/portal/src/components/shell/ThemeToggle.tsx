'use client';

import { useState } from 'react';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

/**
 * Switches the theme at once and remembers it, so the next page loads in it.
 *
 * A sun or a moon, not a word: it sits in the corner of every page, and what
 * it does is plain from the shape. The word is still there for screen readers
 * and as the tooltip.
 */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Switch to dark' : 'Switch to light';

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        setTheme(next);
        document.documentElement.dataset.theme = next;
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      }}
      className="flex size-7 items-center justify-center rounded-[7px] text-fg2 hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  );
}

/** Shown while dark: clicking it brings the light theme. */
function Sun() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

/** Shown while light: clicking it brings the dark theme. */
function Moon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

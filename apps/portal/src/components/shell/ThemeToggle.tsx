'use client';

import { useState } from 'react';
import { THEME_COOKIE, type Theme } from '@/lib/theme';
import { Button } from '@/components/ui/Button';

/** Switches the theme at once and remembers it, so the next page loads in it. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.dataset.theme = next;
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </Button>
  );
}

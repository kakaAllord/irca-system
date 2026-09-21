export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'irca_theme';

/** The design opens in dark, so that is the default until someone chooses. */
export const themeFrom = (value: string | undefined): Theme =>
  value === 'light' ? 'light' : 'dark';

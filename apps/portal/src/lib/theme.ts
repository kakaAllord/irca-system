export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'irca_theme';

/** Light until someone chooses otherwise; the choice is kept in a cookie. */
export const themeFrom = (value: string | undefined): Theme =>
  value === 'dark' ? 'dark' : 'light';

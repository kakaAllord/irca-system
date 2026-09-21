/**
 * Item names are shown as the person typed them and matched without caring
 * about spaces or capitals, so "  Electricity  BILL " and "electricity bill"
 * are one item rather than two.
 */

/** How an item is shown: tidy spaces, keep the person's capitalisation. */
export const tidyName = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** How items are matched and kept unique. */
export const nameKey = (s: string) => tidyName(s).toLocaleLowerCase('en');

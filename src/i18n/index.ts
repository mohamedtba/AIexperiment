import { fr, getDictionary, type Dictionary, type Locale } from './dictionaries/fr';

/**
 * Localization entry point.
 * French is the only available locale for version 1; adding `ar` or `en` only
 * requires a new dictionary file with the same exported shape.
 */
export const locales: Locale[] = ['fr'];
export const defaultLocale: Locale = 'fr';

export { fr, getDictionary };
export type { Dictionary, Locale };
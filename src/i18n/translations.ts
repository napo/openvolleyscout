import type { Locale } from './locale';
import { defaultLocale } from './locale';
import { en } from './locales/en';
import type { it } from './locales/it';

export type TranslationKey = keyof typeof it;
export type Translations = typeof it;
export type TranslationMap = Record<Locale, Translations>;

// Only the default locale ships in the main bundle (it is also the fallback for
// missing keys). The others are split into their own chunks and fetched on demand,
// so the startup bundle does not carry nine unused dictionaries.
const localeLoaders: Record<Locale, () => Promise<Translations>> = {
  it: () => import('./locales/it').then((m) => m.it),
  en: () => Promise.resolve(en as unknown as Translations),
  de: () => import('./locales/de').then((m) => m.de as unknown as Translations),
  sl: () => import('./locales/sl').then((m) => m.sl as unknown as Translations),
  zh: () => import('./locales/zh').then((m) => m.zh as unknown as Translations),
  tr: () => import('./locales/tr').then((m) => m.tr as unknown as Translations),
  ar: () => import('./locales/ar').then((m) => m.ar as unknown as Translations),
  es: () => import('./locales/es').then((m) => m.es as unknown as Translations),
  ro: () => import('./locales/ro').then((m) => m.ro as unknown as Translations),
  ja: () => import('./locales/ja').then((m) => m.ja as unknown as Translations),
};

const loadedTranslations: Partial<TranslationMap> = {
  [defaultLocale]: en as unknown as Translations,
};

export const fallbackTranslations = en as unknown as Translations;

export function getLoadedTranslations(locale: Locale): Translations | undefined {
  return loadedTranslations[locale];
}

export async function loadTranslations(locale: Locale): Promise<Translations> {
  const loaded = loadedTranslations[locale];
  if (loaded) {
    return loaded;
  }
  try {
    const messages = await localeLoaders[locale]();
    loadedTranslations[locale] = messages;
    return messages;
  } catch {
    return fallbackTranslations;
  }
}

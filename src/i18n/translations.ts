import type { Locale } from './locale';
import { en } from './locales/en';
import { it } from './locales/it';

export const translations = {
  it,
  en,
} as const;

export type TranslationKey = keyof typeof it;
export type Translations = typeof it;
export type TranslationMap = Record<Locale, Translations>;

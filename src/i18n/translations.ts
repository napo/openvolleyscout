import type { Locale } from './locale';
import { en } from './locales/en';
import { it } from './locales/it';
import { de } from './locales/de';
import { sl } from './locales/sl';
import { zh } from './locales/zh';

export const translations = {
  it,
  en,
  de,
  sl,
  zh,
} as const;

export type TranslationKey = keyof typeof it;
export type Translations = typeof it;
export type TranslationMap = Record<Locale, Translations>;

import type { Locale } from './locale';
import { en } from './locales/en';
import { ja } from './locales/ja';

export const translations = {
  ja,
  en,
} as const;

export type TranslationKey = keyof typeof en;
export type Translations = typeof en;
export type TranslationMap = Record<Locale, Translations>;

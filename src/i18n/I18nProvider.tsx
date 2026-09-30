import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { defaultLocale, supportedLocales, type Locale } from './locale';
import {
  fallbackTranslations,
  getLoadedTranslations,
  loadTranslations,
  type TranslationKey,
  type Translations,
} from './translations';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  supportedLocales: readonly Locale[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const LOCALE_STORAGE_KEY = 'openvolleyscout.locale';
const PLACEHOLDER_PATTERN = /{{\s*([^{}\s]+)\s*}}/g;

function isSupportedLocale(value: string): value is Locale {
  return supportedLocales.includes(value as Locale);
}

function getBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') {
    return defaultLocale;
  }

  const candidateLocales = [...navigator.languages, navigator.language]
    .filter((value): value is string => Boolean(value));

  for (const candidate of candidateLocales) {
    const normalizedCandidate = candidate.toLowerCase();
    const matchedLocale = supportedLocales.find((locale) => (
      normalizedCandidate === locale || normalizedCandidate.startsWith(`${locale}-`)
    ));

    if (matchedLocale) {
      return matchedLocale;
    }
  }

  return defaultLocale;
}

export function getInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  let storedLocale: string | null = null;
  try {
    storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  if (storedLocale && isSupportedLocale(storedLocale)) {
    return storedLocale;
  }

  return getBrowserLocale();
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  // The dictionary of the active locale. Until a lazily loaded locale arrives,
  // strings fall back to the default locale.
  const [messages, setMessages] = useState<Translations>(
    () => getLoadedTranslations(locale) ?? fallbackTranslations,
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    const loaded = getLoadedTranslations(locale);
    if (loaded) {
      setMessages(loaded);
      return;
    }
    void loadTranslations(locale).then((next) => {
      if (!cancelled) {
        setMessages(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      supportedLocales,
      t: (key: TranslationKey, params?: Record<string, string | number>) => {
        const translation: string = messages[key] ?? fallbackTranslations[key] ?? key;
        if (!params) {
          return translation;
        }

        return translation.replace(PLACEHOLDER_PATTERN, (match, paramKey: string) => (
          Object.prototype.hasOwnProperty.call(params, paramKey) ? String(params[paramKey]) : match
        ));
      },
    }),
    [locale, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}

/** Fetches the dictionary of the startup locale, so the first render is already translated. */
export function preloadInitialLocale(): Promise<unknown> {
  return loadTranslations(getInitialLocale());
}

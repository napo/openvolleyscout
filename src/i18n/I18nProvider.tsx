import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { defaultLocale, supportedLocales, type Locale } from './locale';
import { translations, type TranslationKey } from './translations';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  supportedLocales: readonly Locale[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const LOCALE_STORAGE_KEY = 'openvolleyscout.locale';

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

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (storedLocale && isSupportedLocale(storedLocale)) {
    return storedLocale;
  }

  return getBrowserLocale();
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      supportedLocales,
      t: (key: TranslationKey, params?: Record<string, string | number>) => {
        const translation = translations[locale][key] ?? key;
        if (!params) {
          return translation;
        }

        return Object.entries(params).reduce(
          (result, [paramKey, paramValue]) =>
            result.replace(new RegExp(`{{\\s*${paramKey}\\s*}}`, 'g'), String(paramValue)),
          translation,
        );
      },
    }),
    [locale],
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

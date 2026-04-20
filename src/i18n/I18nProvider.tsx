import { createContext, useContext, useMemo, useState } from 'react';
import { defaultLocale, supportedLocales, type Locale } from './locale';
import { translations, type TranslationKey } from './translations';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  supportedLocales: readonly Locale[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

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

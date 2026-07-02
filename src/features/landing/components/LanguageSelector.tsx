import { useState, useRef, useEffect } from 'react';
import type { Locale } from '@src/i18n/locale';
import { useTranslation } from '@src/i18n';

interface LanguageSelectorProps {
  value: Locale;
  onChange: (locale: Locale) => void;
}

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  const { t, supportedLocales } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const languageNames: Record<Locale, string> = {
    en: t('languageOptionEnglish'),
    it: t('languageOptionItalian'),
    de: t('languageOptionGerman'),
    sl: t('languageOptionSlovenian'),
    zh: t('languageOptionChinese'),
    tr: t('languageOptionTurkish'),
    ar: t('languageOptionArabic'),
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className="language-selector">
      <button
        type="button"
        className="language-selector__trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('selectLanguage')}
        aria-expanded={isOpen}
      >
        <span className="language-selector__current">
          {languageNames[value]}
        </span>
        <span className="language-selector__arrow" aria-hidden="true">
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="language-selector__menu">
          {supportedLocales.map((lang) => (
            <button
              key={lang}
              type="button"
              className={`language-selector__option ${value === lang ? 'is-selected' : ''}`}
              onClick={() => {
                onChange(lang);
                setIsOpen(false);
              }}
              aria-current={value === lang ? 'true' : undefined}
            >
              {languageNames[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

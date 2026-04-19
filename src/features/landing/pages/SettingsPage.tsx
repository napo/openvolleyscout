import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { LandingNavigation } from '../components/LandingNavigation';

export function SettingsPage() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <LandingNavigation currentPage="settings" />

      <div style={{ padding: 'var(--space-xl)', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-primary)' }}>{t('settings')}</h1>

        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <label htmlFor="language-select" style={{ display: 'block', marginBottom: 'var(--space-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>
            {t('selectLanguage')}
          </label>
          <select
            id="language-select"
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'it')}
            style={{
              padding: 'var(--space-md)',
              fontSize: 'var(--font-size-base)',
              border: '1px solid var(--color-text-secondary)',
              borderRadius: 'var(--border-radius-sm)',
              width: '100%',
              maxWidth: '200px',
              background: 'var(--color-background)',
              color: 'var(--color-text-primary)',
            }}
          >
            {supportedLocales.map((lang) => (
              <option key={lang} value={lang}>
                {lang === 'en' ? 'English' : 'Italiano'}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

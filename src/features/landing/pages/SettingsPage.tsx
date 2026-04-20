import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { resetLocalData } from '@src/infrastructure/storage/reset-local-data';

export function SettingsPage() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const closeProject = useAppStore((state) => state.closeProject);

  const handleResetLocalData = async () => {
    const confirmed = window.confirm(t('resetLocalDataConfirmation'));
    if (!confirmed) {
      return;
    }

    try {
      await resetLocalData();
      closeProject();
      window.location.assign('/');
    } catch (error) {
      console.error('Error resetting local data:', error);
    }
  };

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
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

        {import.meta.env.DEV ? (
          <section
            style={{
              padding: 'var(--space-lg)',
              borderRadius: 'var(--border-radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              background: 'rgba(239, 68, 68, 0.06)',
            }}
          >
            <p
              style={{
                margin: 0,
                color: '#b91c1c',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-semibold)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {t('developmentOnly')}
            </p>
            <h2
              style={{
                margin: 'var(--space-sm) 0',
                fontSize: 'var(--font-size-xl)',
                color: 'var(--color-text-primary)',
              }}
            >
              {t('resetLocalData')}
            </h2>
            <p style={{ margin: '0 0 var(--space-md)', color: 'var(--color-text-secondary)' }}>
              {t('resetLocalDataDescription')}
            </p>
            <button
              type="button"
              onClick={handleResetLocalData}
              style={{
                padding: 'var(--space-md) var(--space-lg)',
                borderRadius: 'var(--border-radius-md)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                background: '#b91c1c',
                color: 'var(--color-background)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-base)',
                fontWeight: 'var(--font-weight-medium)',
              }}
            >
              {t('resetLocalData')}
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { resetLocalData } from '@src/infrastructure/storage/reset-local-data';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';

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
    <main className="app-page-screen">
      <div className="app-page-screen__container app-page-screen__container--narrow">
        <AppPageLayout
          className="app-page-card"
          headerClassName="app-page-card__header"
          contentClassName="app-page-card__content settings-page__content"
          header={(
            <div className="app-page-card__header-copy">
              <h1 className="app-page-card__title">{t('settings')}</h1>
            </div>
          )}
        >

          <section className="settings-page__section">
            <label htmlFor="language-select" className="form-label">
              {t('selectLanguage')}
            </label>
            <select
              id="language-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'en' | 'it')}
              className="settings-page__select"
            >
              {supportedLocales.map((lang) => (
                <option key={lang} value={lang}>
                  {lang === 'en' ? t('languageOptionEnglish') : t('languageOptionItalian')}
                </option>
              ))}
            </select>
          </section>

          {import.meta.env.DEV ? (
            <section className="settings-page__danger-zone">
              <p className="settings-page__eyebrow">{t('developmentOnly')}</p>
              <h2 className="settings-page__section-title">{t('resetLocalData')}</h2>
              <p className="settings-page__text">{t('resetLocalDataDescription')}</p>
              <button
                type="button"
                className="settings-page__danger-button"
                onClick={handleResetLocalData}
              >
                {t('resetLocalData')}
              </button>
            </section>
          ) : null}
        </AppPageLayout>
      </div>
    </main>
  );
}

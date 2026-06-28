import { useTranslation } from '@src/i18n';
import type { Locale } from '@src/i18n/locale';
import { useAppStore } from '@src/app/store/app-store';
import { resetLocalData } from '@src/infrastructure/storage/reset-local-data';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { useNavigate } from 'react-router-dom';
import { LanguageSelector } from '../components/LanguageSelector';

const LIVE_SCOUTING_ONBOARDING_KEY = 'openvolleyscout.liveScoutingOnboardingSeen';

export function SettingsPage() {
  const navigate = useNavigate();
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const closeProject = useAppStore((state) => state.closeProject);
  const showDebugSubzones = useAppStore((state) => state.showDebugSubzones);
  const setShowDebugSubzones = useAppStore((state) => state.setShowDebugSubzones);
  const toolbarScale = useAppStore((state) => state.toolbarScale);
  const setToolbarScale = useAppStore((state) => state.setToolbarScale);

  const handleResetLiveHelp = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LIVE_SCOUTING_ONBOARDING_KEY);
    }

    navigate('/scouting?help=true');
  };

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
            <label className="form-label">
              {t('selectLanguage')}
            </label>
            <LanguageSelector
              value={locale}
              onChange={setLocale}
            />
          </section>

          <section className="settings-page__section">
            <label className="form-label">
              {t('toolbarSize')}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="range"
                min="1"
                max="2"
                step="0.1"
                value={toolbarScale}
                onChange={(e) => setToolbarScale(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ minWidth: '2.5rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {toolbarScale.toFixed(1)}×
              </span>
            </div>
          </section>

          <section className="settings-page__section">
            <h2 className="settings-page__section-title">{t('liveScoutingHelpTitle')}</h2>
            <p className="settings-page__text">{t('liveScoutingHelpDescription')}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetLiveHelp}
            >
              {t('liveScoutingHelpOpen')}
            </button>
          </section>

          {import.meta.env.DEV ? (
            <section className="settings-page__section">
              <h2 className="settings-page__section-title">Debug</h2>
              <label className="settings-page__checkbox-label">
                <input
                  type="checkbox"
                  checked={showDebugSubzones}
                  onChange={(e) => setShowDebugSubzones(e.target.checked)}
                />
                {t('showDebugSubzones')}
              </label>
            </section>
          ) : null}

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

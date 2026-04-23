import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';

export function AnalysisPage() {
  const { t } = useTranslation();

  return (
    <main className="app-page-screen">
      <div className="app-page-screen__container app-page-screen__container--narrow">
        <AppPageLayout
          className="app-page-card analysis-page__layout"
          headerClassName="app-page-card__header"
          contentClassName="app-page-card__content analysis-page__content"
          header={(
            <div className="app-page-card__header-copy">
              <h1 className="app-page-card__title">{t('analysisTitle')}</h1>
              <p className="app-page-card__description">{t('analysisDescription')}</p>
            </div>
          )}
        >
          <div className="analysis-page__placeholder">
            <p className="analysis-page__placeholder-copy">{t('comingSoon')}</p>
          </div>
        </AppPageLayout>
      </div>
    </main>
  );
}

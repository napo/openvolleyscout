import { useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { TutorialSlideShow } from '@src/features/scouting/tutorial/TutorialSlideShow';
import { OnboardingTutorialSlideShow } from '@src/features/scouting/tutorial/onboarding/OnboardingTutorialSlideShow';

export function AboutPage() {
  const { t } = useTranslation();
  const [openTutorialTopic, setOpenTutorialTopic] = useState<'scouting' | 'onboarding' | null>(null);

  return (
    <main className="app-page-screen about-page">
      <div className="app-page-screen__container app-page-screen__container--wide">
        <AppPageLayout
          className="app-page-card about-page__layout"
          headerClassName="app-page-card__header about-page__header"
          contentClassName="app-page-card__content about-page__content"
          header={(
            <>
              <div className="app-page-card__header-copy">
                <p className="about-page__eyebrow">{t('about')}</p>
                <h1 className="app-page-card__title">{APP_METADATA.name}</h1>
                <p className="app-page-card__description">{t('aboutProjectDescription')}</p>
              </div>
              <div className="about-page__header-meta">
                <div className="about-page__badges" aria-label={t('aboutStatusSectionTitle')}>
                  <span className="about-badge about-badge--status">{t('aboutStatusActiveDevelopment')}</span>
                  <span className="about-badge about-badge--license">{APP_METADATA.license}</span>
                  <span className="about-badge about-badge--version">{APP_METADATA.version}</span>
                </div>
                <p className="about-page__version-note">{t('aboutVersionUnstable')}</p>
              </div>
            </>
          )}
        >

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutStatusSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutStatusSummary')}</p>
          <p className="about-page__text">
            {t('aboutPublicDemoLabel')}{' '}
            <a href={APP_METADATA.urls.demo} target="_blank" rel="noopener noreferrer" className="about-page__link">
              {APP_METADATA.urls.demo}
            </a>
          </p>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutLocalDataSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutLocalDataBrowser')}</p>
          <p className="about-page__text">{t('aboutLocalDataCaveat')}</p>
          <p className="about-page__text">
            {t('aboutDownloadApps')}{' '}
            <a href={APP_METADATA.urls.releases} target="_blank" rel="noopener noreferrer" className="about-page__link">
              {t('aboutDownloadLinkLabel')}
            </a>
          </p>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutContactSectionTitle')}</h2>
          <dl className="about-page__meta-list">
            <div className="about-page__meta-row">
              <dt>{t('author')}</dt>
              <dd>{APP_METADATA.author.name}</dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('contactEmail')}</dt>
              <dd>
                <a href={`mailto:${APP_METADATA.author.email}`} className="about-page__link">
                  {APP_METADATA.author.email}
                </a>
              </dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('aboutPublicDemo')}</dt>
              <dd>
                <a href={APP_METADATA.urls.demo} target="_blank" rel="noopener noreferrer" className="about-page__link">
                  {APP_METADATA.urls.demo}
                </a>
              </dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('version')}</dt>
              <dd>{APP_METADATA.version}</dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('repository')}</dt>
              <dd>
                <a href={APP_METADATA.urls.repository} target="_blank" rel="noopener noreferrer" className="about-page__link">
                  {t('aboutRepositoryLinkLabel')}
                </a>
              </dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('aboutIssues')}</dt>
              <dd>
                <a href={APP_METADATA.urls.issues} target="_blank" rel="noopener noreferrer" className="about-page__link">
                  {t('aboutIssuesLinkLabel')}
                </a>
              </dd>
            </div>
          </dl>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('metricsGlossaryTitle')}</h2>
          <p className="about-page__text">
            {t('metricsGlossaryAboutPointer')}{' '}
            <Link to="/metrics-glossary" className="about-page__link">
              {t('metricsGlossaryLinkShort')}
            </Link>
          </p>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutContributionSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutContributionIntro')}</p>
          <ul className="about-page__list">
            <li>{t('aboutContributionIssues')}</li>
            <li>{t('aboutContributionImprovements')}</li>
            <li>{t('aboutContributionBugs')}</li>
            <li>{t('aboutContributionChanges')}</li>
            <li>{t('aboutContributionTranslations')}</li>
          </ul>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutAcknowledgementsSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutAcknowledgementsIntro')}</p>
          <ul className="about-page__acknowledgements-list">
            <li className="about-page__acknowledgement-item">
              <strong>Lorenzo Cosentino</strong> <span className="about-page__role-badge">{t('aboutContributionBugs')}</span>
            </li>
            <li className="about-page__acknowledgement-item">
              <strong>Luigi Mazzotta</strong> <span className="about-page__role-badge">{t('aboutContributionBugs')}</span>
            </li>
          </ul>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutTutorialSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutTutorialIntro')}</p>
          <div className="about-page__tutorial-topics">
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => setOpenTutorialTopic('onboarding')}
            >
              {t('aboutTutorialOnboardingLabel')}
            </button>
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => setOpenTutorialTopic('scouting')}
            >
              {t('aboutTutorialScoutingLabel')}
            </button>
          </div>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('license')}</h2>
          <div className="about-page__license-card">
            <span className="about-badge about-badge--license">{APP_METADATA.license}</span>
            <p className="about-page__text">{t('aboutLicenseReleasedUnder', { license: APP_METADATA.license })}</p>
          </div>
        </section>
        </AppPageLayout>
      </div>
      <TutorialSlideShow open={openTutorialTopic === 'scouting'} onClose={() => setOpenTutorialTopic(null)} />
      <OnboardingTutorialSlideShow open={openTutorialTopic === 'onboarding'} onClose={() => setOpenTutorialTopic(null)} />
    </main>
  );
}

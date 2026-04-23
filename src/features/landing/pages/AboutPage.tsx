import { APP_INFO } from '@src/app/config/app-info';
import { useTranslation } from '@src/i18n';

export function AboutPage() {
  const { t } = useTranslation();

  return (
    <main className="about-page">
      <div className="about-page__container">
        <section className="about-page__hero">
          <p className="about-page__eyebrow">{t('about')}</p>
          <h1 className="about-page__title">{t('appName')}</h1>
          <p className="about-page__description">{t('aboutProjectDescription')}</p>

          <div className="about-page__badges" aria-label={t('aboutStatusSectionTitle')}>
            <span className="about-badge about-badge--status">{t('aboutStatusActiveDevelopment')}</span>
            <span className="about-badge about-badge--license">{APP_INFO.license}</span>
            <span className="about-badge about-badge--version">{APP_INFO.version}</span>
          </div>

          <p className="about-page__version-note">{t('aboutVersionUnstable')}</p>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutStatusSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutStatusSummary')}</p>
          <p className="about-page__text">
            {t('aboutPublicReleaseLabel')}{' '}
            <a href={APP_INFO.liveReleaseUrl} target="_blank" rel="noopener noreferrer" className="about-page__link">
              {APP_INFO.liveReleaseUrl}
            </a>
          </p>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutContactSectionTitle')}</h2>
          <dl className="about-page__meta-list">
            <div className="about-page__meta-row">
              <dt>{t('author')}</dt>
              <dd>{APP_INFO.authorName}</dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('contactEmail')}</dt>
              <dd>
                <a href={`mailto:${APP_INFO.authorEmail}`} className="about-page__link">
                  {APP_INFO.authorEmail}
                </a>
              </dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('repository')}</dt>
              <dd>
                <a href={APP_INFO.repositoryUrl} target="_blank" rel="noopener noreferrer" className="about-page__link">
                  {t('aboutRepositoryLinkLabel')}
                </a>
              </dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('aboutIssues')}</dt>
              <dd>
                <a href={APP_INFO.issuesUrl} target="_blank" rel="noopener noreferrer" className="about-page__link">
                  {t('aboutIssuesLinkLabel')}
                </a>
              </dd>
            </div>
          </dl>
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
          <h2 className="about-page__section-title">{t('license')}</h2>
          <div className="about-page__license-card">
            <span className="about-badge about-badge--license">{APP_INFO.license}</span>
            <p className="about-page__text">{t('aboutLicenseReleasedUnder')}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';

export function AboutPage() {
  const { t } = useTranslation();

  return (
    <main className="about-page">
      <div className="about-page__container">
        <section className="about-page__hero">
          <p className="about-page__eyebrow">{t('about')}</p>
          <h1 className="about-page__title">{APP_METADATA.name}</h1>
          <p className="about-page__description">{t('aboutProjectDescription')}</p>

          <div className="about-page__badges" aria-label={t('aboutStatusSectionTitle')}>
            <span className="about-badge about-badge--status">{t('aboutStatusActiveDevelopment')}</span>
            <span className="about-badge about-badge--license">{APP_METADATA.license}</span>
            <span className="about-badge about-badge--version">{APP_METADATA.version}</span>
          </div>

          <p className="about-page__version-note">{t('aboutVersionUnstable')}</p>
        </section>

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
            <span className="about-badge about-badge--license">{APP_METADATA.license}</span>
            <p className="about-page__text">{t('aboutLicenseReleasedUnder', { license: APP_METADATA.license })}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

import { useCallback, useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TUTORIAL_SLUGS, tutorialTopicFromSlug, type TutorialTopic } from '@src/features/landing/tutorials/tutorial-links';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { ExternalLink } from '@src/components/ExternalLink';
import { TutorialSlideShow } from '@src/features/scouting/tutorial/TutorialSlideShow';
import { ImageTutorialSlideShow } from '@src/features/landing/tutorials/ImageTutorialSlideShow';
import { OnboardingTutorialSlideShow } from '@src/features/scouting/tutorial/onboarding/OnboardingTutorialSlideShow';
import paypalLogo from '@src/assets/paypal.svg';

export function AboutPage() {
  const { t } = useTranslation();
  // The home page links straight to a tutorial: open it on arrival.
  // Each tutorial has its own address, /tutorial/<slug>: opening one shows it
  // in the address bar, ready to be shared; closing it goes back to About.
  const { slug } = useParams();
  const navigate = useNavigate();
  const topic = tutorialTopicFromSlug(slug);
  const openTutorial = (next: TutorialTopic) => navigate(`/tutorial/${TUTORIAL_SLUGS[next]}`);
  // On the web the address bar shows the tutorial's preview page
  // (<base>/tutorial/<slug>/), the link to copy: it has its own title and
  // picture in chats and leads back here. The app keeps routing on the hash.
  const previewPath = slug && !isTauri() ? `${import.meta.env.BASE_URL}tutorial/${slug}/` : null;
  useEffect(() => {
    if (!previewPath) return undefined;
    const hashUrl = `${import.meta.env.BASE_URL}#/tutorial/${slug}`;
    window.history.replaceState(window.history.state, '', previewPath);
    return () => {
      if (window.location.pathname === previewPath) window.history.replaceState(window.history.state, '', hashUrl);
    };
  }, [previewPath, slug]);
  const closeTutorial = useCallback(() => {
    if (previewPath && window.location.pathname === previewPath) {
      window.history.replaceState(window.history.state, '', `${import.meta.env.BASE_URL}#/tutorial/${slug}`);
    }
    navigate('/about', { replace: true });
  }, [navigate, previewPath, slug]);
  const openTutorialTopic = topic === 'scouting' || topic === 'onboarding' ? topic : null;
  const openImageTutorial = topic && topic !== 'scouting' && topic !== 'onboarding' ? topic : null;

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
          <h2 className="about-page__section-title">{t('aboutTutorialSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutTutorialIntro')}</p>
          {([
            ['aboutTutorialGroupStart', [
              ['onboarding', 'aboutTutorialOnboardingLabel', 'aboutTutorialOnboardingHint'],
            ]],
            ['aboutTutorialGroupScouting', [
              ['scoutingBasic', 'inputModeBasic', 'inputModeBasicHint'],
              ['scoutingTag', 'inputModeTag', 'inputModeTagHint'],
              ['scoutingCourt', 'inputModeCourt', 'inputModeCourtHint'],
              ['scoutingCourtPhone', 'aboutTutorialScoutingCourtPhoneLabel', 'aboutTutorialCourtPhoneHint'],
              ['scoutingExpert', 'inputModeDetailed', 'inputModeDetailedHint'],
              ['scouting', 'aboutTutorialRallyTitle', 'aboutTutorialRallyHint'],
            ]],
            ['aboutTutorialGroupAfter', [
              ['videoSync', 'aboutTutorialVideoLabel', 'aboutTutorialVideoHint'],
              ['tacticalReport', 'aboutTutorialTacticalLabel', 'aboutTutorialTacticalHint'],
            ]],
          ] as const).map(([groupKey, items]) => (
            <div key={groupKey} className="about-tutorials__group">
              <h3 className="about-tutorials__group-title">{t(groupKey)}</h3>
              <div className="about-tutorials__grid">
                {items.map(([tutorial, titleKey, hintKey]) => (
                  <button key={tutorial} type="button" className="about-tutorials__card" onClick={() => openTutorial(tutorial)}>
                    <span className="about-tutorials__card-title">{t(titleKey)}</span>
                    <span className="about-tutorials__card-hint">{t(hintKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="about-tutorials__note">
            {t('aboutTutorialVideoSample')}{' '}
            <ExternalLink href={`${APP_METADATA.urls.repository}/raw/main/stuttgart-schwrein.dvw`} className="about-page__link">
              {t('aboutTutorialVideoSampleLink')}
            </ExternalLink>
          </p>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutStatusSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutStatusSummary')}</p>
          <p className="about-page__text">
            {t('aboutPublicDemoLabel')}{' '}
            <ExternalLink href={APP_METADATA.urls.webApp} className="about-page__link">
              {APP_METADATA.urls.webApp}
            </ExternalLink>
          </p>
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutLocalDataSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutLocalDataBrowser')}</p>
          <p className="about-page__text">{t('aboutLocalDataCaveat')}</p>
          <p className="about-page__text">
            {t('aboutDownloadApps')}{' '}
            <ExternalLink href={APP_METADATA.urls.releases} className="about-page__link">
              {t('aboutDownloadLinkLabel')}
            </ExternalLink>
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
                <ExternalLink href={APP_METADATA.urls.webApp} className="about-page__link">
                  {APP_METADATA.urls.webApp}
                </ExternalLink>
              </dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('version')}</dt>
              <dd>{APP_METADATA.version}</dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('repository')}</dt>
              <dd>
                <ExternalLink href={APP_METADATA.urls.repository} className="about-page__link">
                  {t('aboutRepositoryLinkLabel')}
                </ExternalLink>
              </dd>
            </div>
            <div className="about-page__meta-row">
              <dt>{t('aboutIssues')}</dt>
              <dd>
                <ExternalLink href={APP_METADATA.urls.issues} className="about-page__link">
                  {t('aboutIssuesLinkLabel')}
                </ExternalLink>
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
        </section>

        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('aboutSupportSectionTitle')}</h2>
          <p className="about-page__text">{t('aboutSupportText')}</p>
          <p>
            <ExternalLink href={APP_METADATA.urls.donation} className="btn-secondary btn-small about-page__donate">
              <img src={paypalLogo} alt="" width="64" height="16" />
              <span>{t('aboutSupportButton')}</span>
            </ExternalLink>
          </p>
          <p className="about-page__text about-page__support-note">{t('aboutSupportNote')}</p>
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
            <li className="about-page__acknowledgement-item">
              <strong>Valentina Perghem</strong> <span className="about-page__role-badge">{t('aboutContributionImprovements')}</span>
            </li>
          </ul>
        </section>



        <section className="about-page__section">
          <h2 className="about-page__section-title">{t('license')}</h2>
          <div className="about-page__license-card">
            <span className="about-badge about-badge--license">{APP_METADATA.license}</span>
            <p className="about-page__text">{t('aboutLicenseReleasedUnder', { license: `GNU AGPL v3 or later (${APP_METADATA.license})` })}</p>
          </div>
        </section>
        </AppPageLayout>
      </div>
      <TutorialSlideShow open={openTutorialTopic === 'scouting'} onClose={closeTutorial} />
      <OnboardingTutorialSlideShow open={openTutorialTopic === 'onboarding'} onClose={closeTutorial} />
      <ImageTutorialSlideShow tutorial={openImageTutorial} onClose={closeTutorial} />
    </main>
  );
}

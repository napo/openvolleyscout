import { useCallback, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TUTORIAL_SLUGS, tutorialTopicFromSlug, type TutorialTopic } from '@src/features/landing/tutorials/tutorial-links';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { ExternalLink } from '@src/components/ExternalLink';
import { TutorialSlideShow } from '@src/features/scouting/tutorial/TutorialSlideShow';
import { ImageTutorialSlideShow } from '@src/features/landing/tutorials/ImageTutorialSlideShow';
import { OnboardingTutorialSlideShow } from '@src/features/scouting/tutorial/onboarding/OnboardingTutorialSlideShow';
import paypalLogo from '@src/assets/paypal.svg';
import { BuildDownloads } from '../components/BuildDownloads';
import '@src/components/layout/tabbed-page.css';
import './about-page.css';

const aboutTabs = [
  { id: 'project', label: 'aboutTabProject' },
  { id: 'tutorials', label: 'aboutTutorialSectionTitle' },
  { id: 'data', label: 'aboutTabData' },
  { id: 'downloads', label: 'aboutTabDownloads' },
  { id: 'contacts', label: 'aboutTabContacts' },
  { id: 'credits', label: 'aboutTabCredits' },
] as const;
type AboutTab = typeof aboutTabs[number]['id'];

function AboutDonationSection() {
  const { t } = useTranslation();
  return (
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
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  // The home page links straight to a tutorial: open it on arrival.
  // Each tutorial has its own address, /tutorial/<slug>: opening one shows it
  // in the address bar, ready to be shared; closing it goes back to About.
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: AboutTab = slug ? 'tutorials'
    : aboutTabs.find((tab) => tab.id === requestedTab)?.id ?? 'project';
  const selectTab = (id: AboutTab) => setSearchParams({ tab: id }, { replace: true });
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (index + 1) % aboutTabs.length; break;
      case 'ArrowLeft': nextIndex = (index - 1 + aboutTabs.length) % aboutTabs.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = aboutTabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    selectTab(aboutTabs[nextIndex].id);
    document.getElementById(`about-tab-${aboutTabs[nextIndex].id}`)?.focus();
  };
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
    navigate('/about?tab=tutorials', { replace: true });
  }, [navigate, previewPath, slug]);
  const openTutorialTopic = topic === 'scouting' || topic === 'onboarding' ? topic : null;
  const openImageTutorial = topic && topic !== 'scouting' && topic !== 'onboarding' ? topic : null;

  return (
    <main className="app-page-screen tabbed-page about-page">
      <div className="app-page-screen__container app-page-screen__container--wide">
        <AppPageLayout
          className="app-page-card tabbed-page__layout about-page__layout"
          headerClassName="app-page-card__header tabbed-page__header about-page__header"
          contentClassName="app-page-card__content tabbed-page__content about-page__content"
          header={(
            <>
              <h1 className="app-page-card__title">{t('about')}</h1>
              <span className="about-badge about-badge--version">{APP_METADATA.version}</span>
            </>
          )}
        >
          <div className="tabbed-page__tabs about-page__tabs" role="tablist" aria-label={t('about')}>
            {aboutTabs.map((tab, index) => (
              <button
                key={tab.id}
                id={`about-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`about-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
          <div
            id="about-panel-project"
            className="tabbed-page__panel about-page__panel"
            role="tabpanel"
            aria-labelledby="about-tab-project"
            tabIndex={0}
            hidden={activeTab !== 'project'}
          >
            <section className="about-page__section">
              <h2 className="about-page__section-title">{APP_METADATA.name}</h2>
              <p className="about-page__text">{t('aboutProjectDescription')}</p>
              <div className="about-page__badges">
                <span className="about-badge about-badge--status">{t('aboutStatusActiveDevelopment')}</span>
                <span className="about-badge about-badge--license">{APP_METADATA.license}</span>
                <span className="about-badge about-badge--version">{APP_METADATA.version}</span>
              </div>
              <p className="about-page__version-note">{t('aboutVersionUnstable')}</p>
            </section>
            <AboutDonationSection />
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
          </div>
          <div
            id="about-panel-tutorials"
            className="tabbed-page__panel about-page__panel"
            role="tabpanel"
            aria-labelledby="about-tab-tutorials"
            tabIndex={0}
            hidden={activeTab !== 'tutorials'}
          >
            <section className="about-page__section">
              <h2 className="about-page__section-title">{t('aboutTutorialSectionTitle')}</h2>
              <p className="about-page__text">{t('aboutTutorialIntro')}</p>
              {([
                ['aboutTutorialGroupStart', [
                  ['onboarding', 'aboutTutorialOnboardingLabel', 'aboutTutorialOnboardingHint'],
                ]],
                ['aboutTutorialGroupScouting', [
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
              <h2 className="about-page__section-title">{t('metricsGlossaryTitle')}</h2>
              <p className="about-page__text">
                {t('metricsGlossaryAboutPointer')}{' '}
                <Link to="/metrics-glossary" className="about-page__link">
                  {t('metricsGlossaryLinkShort')}
                </Link>
              </p>
            </section>
          </div>
          <div
            id="about-panel-data"
            className="tabbed-page__panel about-page__panel"
            role="tabpanel"
            aria-labelledby="about-tab-data"
            tabIndex={0}
            hidden={activeTab !== 'data'}
          >
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
          </div>
          <div
            id="about-panel-downloads"
            className="tabbed-page__panel about-page__panel"
            role="tabpanel"
            aria-labelledby="about-tab-downloads"
            tabIndex={0}
            hidden={activeTab !== 'downloads'}
          >
            {activeTab === 'downloads' && <BuildDownloads />}
          </div>
          <div
            id="about-panel-contacts"
            className="tabbed-page__panel about-page__panel"
            role="tabpanel"
            aria-labelledby="about-tab-contacts"
            tabIndex={0}
            hidden={activeTab !== 'contacts'}
          >
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
          </div>
          <div
            id="about-panel-credits"
            className="tabbed-page__panel about-page__panel"
            role="tabpanel"
            aria-labelledby="about-tab-credits"
            tabIndex={0}
            hidden={activeTab !== 'credits'}
          >
            <section className="about-page__section">
              <h2 className="about-page__section-title">{t('aboutContributionSectionTitle')}</h2>
              <p className="about-page__text">{t('aboutContributionIntro')}</p>
            </section>
            <AboutDonationSection />
            <section className="about-page__section">
              <h2 className="about-page__section-title">{t('aboutAcknowledgementsSectionTitle')}</h2>
              <p className="about-page__text">{t('aboutAcknowledgementsIntro')}</p>
              <ul className="about-page__acknowledgements-list">
                {[
                  { name: 'Lorenzo Cosentino', roles: ['aboutContributionFeedback'] as const },
                  { name: 'Luigi Mazzotta', roles: ['aboutContributionFeedback'] as const },
                  { name: 'Valentina Perghem', roles: ['aboutContributionFeedback'] as const },
                  { name: "Fabio d'Amico", roles: ['aboutContributionLogo', 'aboutContributionFeedback'] as const },
                  { name: 'Alessandro Fellin', roles: ['aboutContributionFeedback'] as const },
                  { name: 'Cataldo Di Michele', roles: ['aboutContributionFeedback'] as const },
                ].map(({ name, roles }) => (
                  <li key={name} className="about-page__acknowledgement-item">
                    <strong>{name}</strong>{' '}
                    {roles.map((role) => (
                      <span key={role} className="about-page__role-badge">{t(role)}</span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
            <section className="about-page__section">
              <h2 className="about-page__section-title">{t('license')}</h2>
              <div className="about-page__license-card">
                <span className="about-badge about-badge--license">{APP_METADATA.license}</span>
                <p className="about-page__text">{t('aboutLicenseReleasedUnder', { license: `GNU AGPL v3 or later (${APP_METADATA.license})` })}</p>
              </div>
            </section>
          </div>
        </AppPageLayout>
      </div>
      <TutorialSlideShow open={openTutorialTopic === 'scouting'} onClose={closeTutorial} />
      <OnboardingTutorialSlideShow open={openTutorialTopic === 'onboarding'} onClose={closeTutorial} />
      <ImageTutorialSlideShow tutorial={openImageTutorial} onClose={closeTutorial} />
    </main>
  );
}

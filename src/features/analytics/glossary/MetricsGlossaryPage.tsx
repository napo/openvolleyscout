import { useTranslation, type TranslationKey } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';

interface GlossaryEntry {
  termKey: TranslationKey;
  abbrKey?: TranslationKey;
  descKey: TranslationKey;
}

const ENTRIES: GlossaryEntry[] = [
  { termKey: 'glossarySideOutTerm', descKey: 'glossarySideOutDesc' },
  { termKey: 'glossaryBreakPointTerm', descKey: 'glossaryBreakPointDesc' },
  { termKey: 'glossaryCounterattackTerm', descKey: 'glossaryCounterattackDesc' },
  { termKey: 'glossaryAttackAfterReceiveTerm', abbrKey: 'glossaryAttackAfterReceiveAbbr', descKey: 'glossaryAttackAfterReceiveDesc' },
  { termKey: 'glossaryAstTerm', abbrKey: 'glossaryAstAbbr', descKey: 'glossaryAstDesc' },
  { termKey: 'glossaryFreeballTerm', descKey: 'glossaryFreeballDesc' },
  { termKey: 'glossaryTransitionBreakPointTerm', descKey: 'glossaryTransitionBreakPointDesc' },
  { termKey: 'glossaryTransitionSideOutTerm', descKey: 'glossaryTransitionSideOutDesc' },
  { termKey: 'glossaryFbsoTerm', abbrKey: 'glossaryFbsoAbbr', descKey: 'glossaryFbsoDesc' },
  { termKey: 'glossaryFbsoShareTerm', descKey: 'glossaryFbsoShareDesc' },
  { termKey: 'glossaryMtrpTerm', abbrKey: 'glossaryMtrpAbbr', descKey: 'glossaryMtrpDesc' },
  { termKey: 'glossaryCpLengthTerm', descKey: 'glossaryCpLengthDesc' },
  { termKey: 'glossaryBpLengthTerm', descKey: 'glossaryBpLengthDesc' },
];

export function MetricsGlossaryPage() {
  const { t } = useTranslation();

  return (
    <main className="app-page-screen about-page">
      <div className="app-page-screen__container app-page-screen__container--wide">
        <AppPageLayout
          className="app-page-card about-page__layout"
          headerClassName="app-page-card__header about-page__header"
          contentClassName="app-page-card__content about-page__content"
          header={(
            <div className="app-page-card__header-copy">
              <p className="about-page__eyebrow">{t('situationAnalytics')}</p>
              <h1 className="app-page-card__title">{t('metricsGlossaryTitle')}</h1>
              <p className="app-page-card__description">{t('metricsGlossaryIntro')}</p>
            </div>
          )}
        >
          <section className="about-page__section">
            <dl className="metrics-glossary__list">
              {ENTRIES.map((entry) => (
                <div key={entry.termKey} className="metrics-glossary__entry">
                  <dt className="metrics-glossary__term">
                    {entry.abbrKey ? (
                      <abbr title={t(entry.termKey)}>{t(entry.abbrKey)}</abbr>
                    ) : (
                      t(entry.termKey)
                    )}
                  </dt>
                  <dd className="metrics-glossary__desc">{t(entry.descKey)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </AppPageLayout>
      </div>
    </main>
  );
}

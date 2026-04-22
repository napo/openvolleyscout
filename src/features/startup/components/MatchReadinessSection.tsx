import { useTranslation } from '@src/i18n';
import type { MatchReadinessResult } from '@src/lib/validation/match-readiness';

type MatchReadinessSectionProps = {
  readiness: MatchReadinessResult;
};

export function MatchReadinessSection({ readiness }: MatchReadinessSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="match-readiness-card" aria-labelledby="match-readiness-title">
      <div className="match-readiness-card__header">
        <div>
          <h3 id="match-readiness-title" className="section-title">
            {t('matchReadiness')}
          </h3>
          <p className="match-readiness-card__summary">
            {readiness.isReady ? t('matchReadyToStartScouting') : t('matchNotReadyToStartScouting')}
          </p>
        </div>
        <span className={`match-readiness-badge ${readiness.isReady ? 'is-ready' : 'is-blocked'}`}>
          {readiness.isReady ? t('ready') : t('blocked')}
        </span>
      </div>

      <div className="match-readiness-list" role="list">
        {readiness.checks.map((check) => (
          <article
            key={check.key}
            className={`match-readiness-item is-${check.status}`}
            role="listitem"
          >
            <div className="match-readiness-item__row">
              <strong className="match-readiness-item__label">{t(check.labelKey)}</strong>
              <span className="match-readiness-item__status">
                {check.status === 'passed' ? t('passed') : t('required')}
              </span>
            </div>

            {check.detailKeys.length > 0 && (
              <ul className="match-readiness-item__details">
                {check.detailKeys.map((detailKey) => (
                  <li key={`${check.key}-${detailKey}`}>{t(detailKey)}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>

      {!readiness.isReady && readiness.issues.length > 0 && (
        <div className="match-readiness-card__footer" role="alert">
          {t('completeReadinessItemsToStartScouting')}
        </div>
      )}
    </section>
  );
}

import type { CompletedSetDisplaySummary } from '../model';
import { useTranslation } from '@src/i18n';
import { ScoutingStageFrame } from './ScoutingStageFrame';

interface MatchEndStageProps {
  awayTeamName: string;
  homeTeamName: string;
  winnerTeamName: string;
  setsWon: {
    home: number;
    away: number;
  };
  completedSets: CompletedSetDisplaySummary[];
  onOpenAnalysis: () => Promise<void>;
  onBackToMatchSetup: () => void;
}

export function MatchEndStage({
  awayTeamName,
  homeTeamName,
  winnerTeamName,
  setsWon,
  completedSets,
  onOpenAnalysis,
  onBackToMatchSetup,
}: MatchEndStageProps) {
  const { t } = useTranslation();

  return (
    <ScoutingStageFrame
      stage="match_end"
      eyebrow={t('matchEndEyebrow')}
      title={t('matchEndTitle')}
      description={t('matchEndDescription')}
      footer={(
        <div className="scouting-stage__actions">
          <button type="button" className="btn-primary" onClick={() => void onOpenAnalysis()}>
            {t('openAnalysis')}
          </button>
          <button type="button" className="btn-secondary" onClick={onBackToMatchSetup}>
            {t('backToMatchSetup')}
          </button>
        </div>
      )}
    >
      <div className="match-end-stage">
        <section className="scouting-stage-panel match-end-stage__result">
          <span className="scouting-stage__score-label">{t('matchWinner')}</span>
          <h3 className="match-end-stage__winner">{winnerTeamName}</h3>

          <div className="match-end-stage__teams">
            <div className="match-end-stage__team">
              <span className="match-end-stage__team-role">{t('away')}</span>
              <strong>{awayTeamName}</strong>
            </div>
            <div className="match-end-stage__score">
              <span>{setsWon.away}</span>
              <span className="scouting-stage__score-divider">:</span>
              <span>{setsWon.home}</span>
            </div>
            <div className="match-end-stage__team">
              <span className="match-end-stage__team-role">{t('home')}</span>
              <strong>{homeTeamName}</strong>
            </div>
          </div>

          <div className="match-end-stage__score-summary">
            <div className="scouting-stage-stat">
              <span className="scouting-stage-stat__label">{t('finalMatchResult')}</span>
              <strong className="scouting-stage-stat__value">
                {setsWon.away} : {setsWon.home}
              </strong>
            </div>
          </div>
        </section>

        <section className="scouting-stage-panel scouting-stage-panel--scroll match-end-stage__completed-sets">
          <div className="match-end-stage__panel-header">
            <div>
              <span className="scouting-config__section-kicker">{t('completedSetsTitle')}</span>
              <h3 className="match-end-stage__panel-title">{t('completedSetsSummary')}</h3>
            </div>
            <p className="set-end-stage__hint">{t('completedSetsSummaryHint')}</p>
          </div>

          <div className="match-end-stage__set-list">
            {completedSets.map((setSummary) => (
              <article key={setSummary.setNumber} className="match-end-stage__set-card">
                <div>
                  <span className="scouting-stage-stat__label">
                    {t('setLabel', { setNumber: setSummary.setNumber })}
                  </span>
                  <strong className="match-end-stage__set-winner">
                    {setSummary.winner === 'home'
                      ? homeTeamName
                      : setSummary.winner === 'away'
                        ? awayTeamName
                        : t('notSpecified')}
                  </strong>
                </div>
                <div className="match-end-stage__set-score">
                  <span>{setSummary.awayScore}</span>
                  <span className="scouting-stage__score-divider">:</span>
                  <span>{setSummary.homeScore}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </ScoutingStageFrame>
  );
}

import type { CompletedSetSummary } from '@src/domain/scouting/types';
import { useTranslation } from '@src/i18n';
import { ScoutingStageFrame } from './ScoutingStageFrame';

interface SetEndStageProps {
  latestCompletedSet: CompletedSetSummary;
  quickStats: {
    rallyCount: number;
    touchCount: number;
  };
  onStartNextSet: () => void;
  onFinishMatch: () => void;
}

export function SetEndStage({
  latestCompletedSet,
  quickStats,
  onStartNextSet,
  onFinishMatch,
}: SetEndStageProps) {
  const { t } = useTranslation();

  return (
    <ScoutingStageFrame
      eyebrow={t('setEndEyebrow', { setNumber: latestCompletedSet.setNumber })}
      title={t('setEndTitle')}
      description={t('setEndDescription')}
    >
      <div className="set-end-stage">
        <div className="scouting-stage-panel set-end-stage__score">
          <span className="scouting-stage__score-label">{t('setResult')}</span>
          <div className="scouting-stage__score-value">
            <span>{latestCompletedSet.awayScore}</span>
            <span className="scouting-stage__score-divider">:</span>
            <span>{latestCompletedSet.homeScore}</span>
          </div>
        </div>

        <div className="set-end-stage__stats">
          <div className="scouting-stage-stat">
            <span className="scouting-stage-stat__label">{t('quickStatRallies')}</span>
            <strong className="scouting-stage-stat__value">{quickStats.rallyCount}</strong>
          </div>
          <div className="scouting-stage-stat">
            <span className="scouting-stage-stat__label">{t('quickStatTouches')}</span>
            <strong className="scouting-stage-stat__value">{quickStats.touchCount}</strong>
          </div>
        </div>

        <div className="set-end-stage__actions">
          <button type="button" className="btn-primary" onClick={onStartNextSet}>
            {t('startNextSet')}
          </button>
          <button type="button" className="btn-secondary" onClick={onFinishMatch}>
            {t('finishMatch')}
          </button>
        </div>
      </div>
    </ScoutingStageFrame>
  );
}

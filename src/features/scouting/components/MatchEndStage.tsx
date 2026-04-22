import { useTranslation } from '@src/i18n';
import { ScoutingStageFrame } from './ScoutingStageFrame';

interface MatchEndStageProps {
  awayTeamName: string;
  homeTeamName: string;
  setsWon: {
    home: number;
    away: number;
  };
  onOpenAnalysis: () => Promise<void>;
}

export function MatchEndStage({
  awayTeamName,
  homeTeamName,
  setsWon,
  onOpenAnalysis,
}: MatchEndStageProps) {
  const { t } = useTranslation();

  return (
    <ScoutingStageFrame
      eyebrow={t('matchEndEyebrow')}
      title={t('matchEndTitle')}
      description={t('matchEndDescription')}
    >
      <div className="match-end-stage">
        <div className="scouting-stage-panel match-end-stage__result">
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
        </div>

        <div className="match-end-stage__actions">
          <button type="button" className="btn-primary" onClick={() => void onOpenAnalysis()}>
            {t('openAnalysis')}
          </button>
        </div>
      </div>
    </ScoutingStageFrame>
  );
}

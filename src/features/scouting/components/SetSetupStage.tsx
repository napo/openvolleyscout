import type { Team } from '@src/domain/roster/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import { useTranslation } from '@src/i18n';
import { SetStartFlow } from './SetStartFlow';

interface SetSetupStageProps {
  matchSummary: string;
  homeTeam: Team;
  awayTeam: Team;
  onBack: () => void;
  onSetStarted: (input: {
    homeStartingLineup: StartingLineup;
    awayStartingLineup: StartingLineup;
    servingTeam: 'home' | 'away';
  }) => void;
}

export function SetSetupStage({ matchSummary, homeTeam, awayTeam, onBack, onSetStarted }: SetSetupStageProps) {
  const { t } = useTranslation();

  return (
    <section className="set-setup-stage">
      <p className="scouting-screen__pre-match-summary">
        <span className="scouting-screen__pre-match-summary-label">{t('match')}:</span>{' '}
        {matchSummary}
      </p>
      <div className="scouting-stage-panel scouting-stage-panel--set-setup">
        <SetStartFlow
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onBack={onBack}
          onSetStarted={onSetStarted}
        />
      </div>
    </section>
  );
}

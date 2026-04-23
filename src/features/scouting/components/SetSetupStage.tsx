import type { Team } from '@src/domain/roster/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import { useTranslation } from '@src/i18n';
import { SetStartFlow } from './SetStartFlow';
import { ScoutingStageFrame } from './ScoutingStageFrame';

interface SetSetupStageProps {
  homeTeam: Team;
  awayTeam: Team;
  setNumber: number;
  onSetStarted: (input: {
    homeStartingLineup: StartingLineup;
    awayStartingLineup: StartingLineup;
    servingTeam: 'home' | 'away';
  }) => void;
}

export function SetSetupStage({ homeTeam, awayTeam, setNumber, onSetStarted }: SetSetupStageProps) {
  const { t } = useTranslation();

  return (
    <ScoutingStageFrame
      eyebrow={t('setSetupEyebrow', { setNumber })}
      title={t('setSetupStageTitle', { setNumber })}
      description={t('setSetupStageDescription')}
      bodyClassName="scouting-stage__body--static"
    >
      <div className="scouting-stage-panel">
        <SetStartFlow
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          setNumber={setNumber}
          onSetStarted={onSetStarted}
        />
      </div>
    </ScoutingStageFrame>
  );
}

import type { Team } from '@src/domain/roster/types';
import type { ScoutingZone } from '@src/domain/spatial';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import { useTranslation } from '@src/i18n';
import { ScoutingCourt } from './ScoutingCourt';
import { ScoutingStageFrame } from './ScoutingStageFrame';
import type { LiveCourtPhase } from '../model';

interface LiveRallyStageProps {
  awayTeam: Team;
  homeTeam: Team;
  awayLineup: ActiveLineup | null;
  homeLineup: ActiveLineup | null;
  servingTeam: 'home' | 'away' | null;
  courtPhase: LiveCourtPhase;
  isRallyActive: boolean;
  currentRallyTouches: BallTouch[];
  selectedZone: ScoutingZone | null;
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchConfirm: (input: {
    playerId?: string;
    teamSide: 'home' | 'away';
    skill: SkillType;
    evaluation?: SkillEvaluation;
    zone: ScoutingZone;
  }) => void;
}

export function LiveRallyStage({
  awayTeam,
  homeTeam,
  awayLineup,
  homeLineup,
  servingTeam,
  courtPhase,
  isRallyActive,
  currentRallyTouches,
  selectedZone,
  onSelectedZoneChange,
  onTouchConfirm,
}: LiveRallyStageProps) {
  const { t } = useTranslation();

  return (
    <ScoutingStageFrame
      stage="live_rally"
      eyebrow=""
      title=""
      description=""
      bodyClassName="scouting-stage__body--live-rally"
    >
      <div className="live-rally-stage">
        <ScoutingCourt
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          awayLineup={awayLineup}
          homeLineup={homeLineup}
          servingTeam={servingTeam}
          courtPhase={courtPhase}
          isRallyActive={isRallyActive}
          currentRallyTouches={currentRallyTouches}
          selectedZone={selectedZone}
          onSelectedZoneChange={onSelectedZoneChange}
          onTouchConfirm={onTouchConfirm}
        />
      </div>
    </ScoutingStageFrame>
  );
}

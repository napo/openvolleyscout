import type { Team } from '@src/domain/roster/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { ScoutingZone } from '@src/domain/spatial';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';
import { ScoutingCourt } from './ScoutingCourt';
import { ScoutingStageFrame } from './ScoutingStageFrame';
import type { LiveCourtPhase, PendingTouch, TeamTacticalPhases } from '../model';

interface LiveRallyStageProps {
  awayTeam: Team;
  homeTeam: Team;
  awayLineup: ActiveLineup | null;
  homeLineup: ActiveLineup | null;
  defenseSystemBlock?: DefenseSystemBlock | null;
  receptionSystemBlock?: ReceptionSystemBlock | null;
  teamTacticalPhases: TeamTacticalPhases;
  servingTeam: 'home' | 'away' | null;
  courtPhase: LiveCourtPhase;
  isRallyActive: boolean;
  currentRallyTouches: BallTouch[];
  selectedZone: ScoutingZone | null;
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  statusMessage?: string | null;
}

export function LiveRallyStage({
  awayTeam,
  homeTeam,
  awayLineup,
  homeLineup,
  defenseSystemBlock,
  receptionSystemBlock,
  teamTacticalPhases,
  servingTeam,
  courtPhase,
  isRallyActive,
  currentRallyTouches,
  selectedZone,
  onSelectedZoneChange,
  onTouchesCommitted,
  onRallyEnd,
  statusMessage,
}: LiveRallyStageProps) {
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
          defenseSystemBlock={defenseSystemBlock}
          receptionSystemBlock={receptionSystemBlock}
          teamTacticalPhases={teamTacticalPhases}
          servingTeam={servingTeam}
          courtPhase={courtPhase}
          isRallyActive={isRallyActive}
          currentRallyTouches={currentRallyTouches}
          selectedZone={selectedZone}
          onSelectedZoneChange={onSelectedZoneChange}
          onTouchesCommitted={onTouchesCommitted}
          onRallyEnd={onRallyEnd}
          statusMessage={statusMessage}
        />
      </div>
    </ScoutingStageFrame>
  );
}

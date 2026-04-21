// Scouting feature model exports and shared types.
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import type { StartingLineup, ActiveLineup } from '@src/domain/lineup/types';
import type { ScoutingSession } from '@src/domain/scouting/types';
import type { BallTouch } from '@src/domain/touch/types';

export interface LiveMatchState extends ScoutingSession {
  eventLog: MatchEvent[];
  isRallyActive: boolean;
}

export type ScoutingState = {
  liveMatch: LiveMatchState | null;
  syncWithProject: (project: MatchProject | null) => void;
  startSet: (input: {
    activeProjectId: string;
    setNumber: number;
    homeStartingLineup: StartingLineup;
    awayStartingLineup: StartingLineup;
    servingTeam: TeamSide;
    existingEvents?: MatchEvent[];
  }) => MatchEvent;
  endSet: () => void;
  startRally: () => void;
  recordTouch: (touch: BallTouch) => void;
  awardPoint: (teamSide: TeamSide, reason?: string) => void;
  endRally: () => void;
  resetLiveMatch: () => void;
};

// Export the scouting store
export { useScoutingStore } from './scouting-store';

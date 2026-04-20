// Scouting feature model exports and shared types.
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';

export interface LiveMatchState {
  currentSetNumber: number;
  currentRallyNumber: number;
  homeScore: number;
  awayScore: number;
  servingTeam: TeamSide | null;
  homeLineup: StartingLineup | null;
  awayLineup: StartingLineup | null;
  eventLog: MatchEvent[];
  isSetActive: boolean;
  isRallyActive: boolean;
}

export type ScoutingState = {
  liveMatch: LiveMatchState | null;
  startSet: (homeLineup: StartingLineup, awayLineup: StartingLineup, servingTeam: TeamSide) => void;
  endSet: () => void;
  startRally: () => void;
  recordTouch: (touch: BallTouch) => void;
  awardPoint: (teamSide: TeamSide, reason?: string) => void;
  endRally: () => void;
  resetLiveMatch: () => void;
};

// Export the scouting store
export { useScoutingStore } from './scouting-store';

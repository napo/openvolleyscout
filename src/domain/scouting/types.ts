import type { ActiveLineup } from '../lineup/types';
import type { TeamSide } from '../common/enums';
import type { BallTouch } from '../touch/types';
import type { MatchFormat } from '../common/enums';
import type { ScoutingBallPath } from '../spatial/types';

export interface CompletedSetSummary {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  completedAt: number;
}

export interface ScoutingMatchConfig {
  matchFormat: MatchFormat;
  maxSetsToWin: number;
  setTargetPoints: number;
  tieBreakTargetPoints: number;
  enableGoldenSet: boolean;
  goldenSetTargetPoints: number;
}

export interface ScoutingSession {
  activeProjectId: string;
  currentSetNumber: number;
  currentRallyNumber: number;
  homeScore: number;
  awayScore: number;
  servingTeam: TeamSide | null;
  homeActiveLineup: ActiveLineup | null;
  awayActiveLineup: ActiveLineup | null;
  isSetStarted: boolean;
  isRallyActive: boolean;
  currentRallyTouches: BallTouch[];
  currentRallyPointWinner: TeamSide | null;
  currentBallPath: ScoutingBallPath | null;
  completedSets: CompletedSetSummary[];
  startedAt?: number;
  updatedAt?: number;
}

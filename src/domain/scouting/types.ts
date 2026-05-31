import type { ActiveLineup, SetLineupSnapshot } from '../lineup/types';
import type { TeamSide } from '../common/enums';
import type { BallTouch } from '../touch/types';
import type { MatchFormat } from '../common/enums';
import type { ScoutingBallPath } from '../spatial/types';

export interface CompletedSetSummary {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  winningTeam: TeamSide | null;
  completedAt: number;
}

export interface GoldenSetScoreSummary {
  setNumber?: number;
  homeScore: number;
  awayScore: number;
  winningTeam: TeamSide | null;
  completedAt?: number;
}

export type ScoutingMatchStatus = 'not_started' | 'in_progress' | 'completed';
export type ScoutingMode = 'simple' | 'advanced' | 'expert';

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
  scoutingMode: ScoutingMode;
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
  lineupSnapshots?: SetLineupSnapshot[];
  matchStatus?: ScoutingMatchStatus;
  matchWinner?: TeamSide | null;
  goldenSetScore?: GoldenSetScoreSummary | null;
  startedAt?: number;
  updatedAt?: number;
}

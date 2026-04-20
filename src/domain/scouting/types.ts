import type { TeamSide } from '../common/enums';

export interface SetState {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  servingTeam?: TeamSide;
  isComplete: boolean;
}

export interface RallyState {
  rallyNumber: number;
  setNumber: number;
  servingTeam?: TeamSide;
  lastWinningTeam?: TeamSide;
  touchCount: number;
  isComplete: boolean;
}

export interface ScoutingSession {
  currentSet: SetState | null;
  currentRally: RallyState | null;
  startedAt?: number;
  updatedAt?: number;
}

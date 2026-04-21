import type { ActiveLineup } from '../lineup/types';
import type { TeamSide } from '../common/enums';

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
  startedAt?: number;
  updatedAt?: number;
}

import type { TeamSide } from '../common/enums';
import type { BallTouch } from '../touch/types';
import type { StartingLineup } from '../lineup/types';

export type MatchEvent =
  | {
      id: string;
      type: 'match_created';
      createdAt: number;
    }
  | {
      id: string;
      type: 'set_started';
      setNumber: number;
      createdAt: number;
      homeLineup: StartingLineup;
      awayLineup: StartingLineup;
      servingTeam: TeamSide;
    }
  | {
      id: string;
      type: 'touch_recorded';
      createdAt: number;
      touch: BallTouch;
    }
  | {
      id: string;
      type: 'point_awarded';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide: TeamSide;
      reason?: string;
    }
  | {
      id: string;
      type: 'substitution_made';
      createdAt: number;
      setNumber: number;
      teamSide: TeamSide;
      playerOutId: string;
      playerInId: string;
    }
  | {
      id: string;
      type: 'timeout_called';
      createdAt: number;
      setNumber: number;
      teamSide: TeamSide;
    }
  | {
      id: string;
      type: 'set_ended';
      createdAt: number;
      setNumber: number;
      winningTeam: TeamSide;
      homeScore: number;
      awayScore: number;
    };

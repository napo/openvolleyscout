import type { TeamSide } from '../common/enums';
import type { BallTouch } from '../touch/types';
import type { StartingLineup } from '../lineup/types';
import type { PlayerRole } from '../systems/types';
import type { ScoutingGridCoordinate, ScoutingPoint, ScoutingZoneId } from '../spatial';

export interface EventLocationReference {
  teamSide?: TeamSide;
  zoneId?: ScoutingZoneId;
  gridCoordinate?: ScoutingGridCoordinate;
  point?: ScoutingPoint;
}

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
      type: 'rally_started';
      createdAt: number;
    }
  | {
      id: string;
      type: 'touch_recorded';
      createdAt: number;
      touch: BallTouch;
      location?: EventLocationReference;
    }
  | {
      id: string;
      type: 'point_awarded';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide: TeamSide;
      reason?: string;
      skipRotation?: boolean;
    }
  | {
      id: string;
      type: 'substitution_made';
      createdAt: number;
      setNumber: number;
      rallyNumber?: number;
      teamSide: TeamSide;
      playerOutId: string;
      playerInId: string;
      canReenterOnlyForPlayerId?: string;
      hasReentered?: boolean;
    }
  | {
      id: string;
      type: 'timeout_called';
      createdAt: number;
      setNumber: number;
      rallyNumber?: number;
      teamSide: TeamSide;
    }
  | {
      id: string;
      type: 'libero_replacement_made';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide: TeamSide;
      liberoPlayerId: string;
      replacedPlayerId: string;
      replacedPlayerRole?: PlayerRole;
      playerOutId: string;
      playerInId: string;
      action: 'libero_enters' | 'regular_returns' | 'second_libero_enters';
    }
  | {
      id: string;
      type: 'red_card_point';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide: TeamSide;
      penalizedTeamSide: TeamSide;
      reason: 'red_card';
    }
  | {
      id: string;
      type: 'replay_action';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide?: TeamSide;
      reason: 'replay';
    }
  | {
      id: string;
      type: 'video_check_correction';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide?: TeamSide;
      reason: 'video_check';
      touchId?: string;
    }
  | {
      id: string;
      type: 'sanction_recorded';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide: TeamSide;
      reason: 'reminder' | 'warning' | 'sanction';
    }
  | {
      id: string;
      type: 'dead_ball_event_recorded';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide: TeamSide;
      reason: 'other';
    }
  | {
      id: string;
      type: 'setter_assigned';
      createdAt: number;
      setNumber: number;
      teamSide: TeamSide;
      setterPlayerId: string;
    }
  | {
      id: string;
      type: 'set_ended';
      createdAt: number;
      setNumber: number;
      winningTeam: TeamSide;
      homeScore: number;
      awayScore: number;
      /** Real set duration in milliseconds when known (e.g. from DVW import). */
      durationMillis?: number;
    }
  | {
      id: string;
      type: 'rally_ended';
      createdAt: number;
      setNumber?: number;
      rallyNumber?: number;
    };

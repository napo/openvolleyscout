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

export type ManualCorrectionKind =
  | 'point_added'
  | 'point_removed'
  | 'rotation_forward'
  | 'rotation_backward'
  | 'serve_assigned';

/** Time of day (HH.MM.SS), video file number and video position (seconds) of a row of an imported file. */
export interface DataVolleyRowStamp {
  time?: string;
  videoFile?: string;
  videoTime?: string;
}

export interface DataVolleyGreenCode extends DataVolleyRowStamp {
  code: string;
  pointPhase?: string;
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
      /** Video position when the point was recorded with the video open: where the rally ends. */
      videoTimeSeconds?: number;
      /** The point row of the imported file: its time of day and video position. */
      dataVolleyRow?: DataVolleyRowStamp;
      /** The setter-position row ("*z4") the file wrote after this point, when the winner rotated. */
      dataVolleyRotationRow?: DataVolleyRowStamp;
      /**
       * DataVolley "green codes" of the rally in an imported file (a point or an error of the team,
       * without a player, e.g. `a$$&H=`), kept as read to write the file back unchanged.
       */
      dataVolleyGreenCodes?: DataVolleyGreenCode[];
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
      /** The row of the imported file: its time of day and video position. */
      dataVolleyRow?: DataVolleyRowStamp;
    }
  | {
      id: string;
      type: 'timeout_called';
      createdAt: number;
      setNumber: number;
      rallyNumber?: number;
      teamSide: TeamSide;
      /** The row of the imported file: its time of day and video position. */
      dataVolleyRow?: DataVolleyRowStamp;
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
      /**
       * Scorer's manual correction between rallies (DataVolley score and
       * rotation keys, Click&Scout "Modifica"): it changes the score, the
       * rotation or the serve without being a rally, so stats ignore it.
       */
      type: 'manual_correction';
      createdAt: number;
      setNumber: number;
      rallyNumber: number;
      teamSide: TeamSide;
      correction: ManualCorrectionKind;
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
      /** The set-end row of the imported file: its time of day and video position. */
      dataVolleyRow?: DataVolleyRowStamp;
    }
  | {
      id: string;
      type: 'rally_ended';
      createdAt: number;
      setNumber?: number;
      rallyNumber?: number;
    };

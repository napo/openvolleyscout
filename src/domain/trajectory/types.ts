import type { SkillEvaluation, SkillType, TeamSide } from '../common/enums';

export interface StagePoint {
  x: number;
  y: number;
}

export interface BallDirection {
  start: StagePoint;
  end: StagePoint;
  isOutsideCourtStart?: boolean;
  isOutsideCourtEnd?: boolean;
  courtZoneStart?: string;
  courtZoneEnd?: string;
  subzoneStart?: 'A' | 'B' | 'C' | 'D';
  subzoneEnd?: 'A' | 'B' | 'C' | 'D';
}

export interface BallTrajectoryPoint extends StagePoint {
  timestamp?: number;
}

export interface BallTrajectory {
  id: string;
  rallyTouchId?: string;
  teamSide?: TeamSide;
  skill?: SkillType;
  evaluation?: SkillEvaluation;
  direction: BallDirection;
  points?: BallTrajectoryPoint[];
  inferred?: boolean;
}

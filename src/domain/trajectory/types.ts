import type { SkillEvaluation, SkillType, TeamSide } from '../common/enums';

export interface BallTrajectoryPoint {
  x: number;
  y: number;
  timestamp?: number;
}

export interface BallTrajectory {
  id: string;
  rallyTouchId?: string;
  teamSide?: TeamSide;
  skill?: SkillType;
  evaluation?: SkillEvaluation;
  points: BallTrajectoryPoint[];
  inferred?: boolean;
}

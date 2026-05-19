import {
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_SURFACE_WIDTH,
  type ScoutingPoint,
} from '../spatial';
import type { BallTouch } from '../touch/types';
import type { BallTrajectory, BallTrajectoryPoint } from './types';

export const BALL_TRAJECTORY_MAX_POINTS = 24;
export const BALL_TRAJECTORY_MIN_POINT_DISTANCE = 1.15;

type TrajectoryMetadata = Pick<BallTrajectory, 'rallyTouchId' | 'teamSide' | 'skill' | 'evaluation' | 'inferred'>;

type SimplifyOptions = {
  minDistance?: number;
  maxPoints?: number;
};

function createTrajectoryId() {
  return `trajectory-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toTrajectoryPoint(point: ScoutingPoint | BallTrajectoryPoint): BallTrajectoryPoint {
  return {
    x: point.x,
    y: point.y,
    timestamp: 'timestamp' in point ? point.timestamp : undefined,
  };
}

function getPointDistance(left: BallTrajectoryPoint, right: BallTrajectoryPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function areSamePoint(left: BallTrajectoryPoint, right: BallTrajectoryPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function capTrajectoryPoints(
  points: BallTrajectoryPoint[],
  maxPoints = BALL_TRAJECTORY_MAX_POINTS,
): BallTrajectoryPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }

  if (maxPoints <= 2) {
    return [points[0], points[points.length - 1]];
  }

  const interiorPoints = points.slice(1, -1);
  const interiorLimit = maxPoints - 2;
  const step = Math.ceil(interiorPoints.length / interiorLimit);
  const sampledInterior = interiorPoints.filter((_, index) => index % step === 0).slice(0, interiorLimit);

  return [points[0], ...sampledInterior, points[points.length - 1]];
}

export function simplifyBallTrajectoryPoints(
  points: readonly (ScoutingPoint | BallTrajectoryPoint)[],
  options: SimplifyOptions = {},
): BallTrajectoryPoint[] {
  const minDistance = options.minDistance ?? BALL_TRAJECTORY_MIN_POINT_DISTANCE;
  const simplified = points.reduce<BallTrajectoryPoint[]>((currentPoints, point) => {
    const nextPoint = toTrajectoryPoint(point);
    const previousPoint = currentPoints.at(-1);

    if (!previousPoint) {
      return [nextPoint];
    }

    if (areSamePoint(previousPoint, nextPoint)) {
      return currentPoints;
    }

    if (getPointDistance(previousPoint, nextPoint) < minDistance) {
      return currentPoints.length === 1
        ? [currentPoints[0], nextPoint]
        : [...currentPoints.slice(0, -1), nextPoint];
    }

    return [...currentPoints, nextPoint];
  }, []);

  return capTrajectoryPoints(simplified, options.maxPoints ?? BALL_TRAJECTORY_MAX_POINTS);
}

export function isPointOutsideScoutingCourt(point: ScoutingPoint): boolean {
  return (
    point.x < SCOUTING_SURFACE_INSET_X
    || point.x > SCOUTING_SURFACE_INSET_X + SCOUTING_SURFACE_WIDTH
    || point.y < SCOUTING_SURFACE_INSET_Y
    || point.y > SCOUTING_SURFACE_INSET_Y + SCOUTING_SURFACE_HEIGHT
  );
}

export function getBallTrajectoryOutsideCourtPoints(trajectory: BallTrajectory): BallTrajectoryPoint[] {
  return trajectory.points.filter(isPointOutsideScoutingCourt);
}

export function createBallTrajectory(input: TrajectoryMetadata & {
  id?: string;
  points: readonly (ScoutingPoint | BallTrajectoryPoint)[];
}): BallTrajectory | null {
  const points = simplifyBallTrajectoryPoints(input.points);

  if (points.length < 2) {
    return null;
  }

  return {
    id: input.id ?? createTrajectoryId(),
    rallyTouchId: input.rallyTouchId,
    teamSide: input.teamSide,
    skill: input.skill,
    evaluation: input.evaluation,
    points,
    inferred: input.inferred,
  };
}

export function updateBallTrajectoryMetadata(
  trajectory: BallTrajectory,
  metadata: TrajectoryMetadata,
): BallTrajectory {
  return {
    ...trajectory,
    rallyTouchId: metadata.rallyTouchId ?? trajectory.rallyTouchId,
    teamSide: metadata.teamSide ?? trajectory.teamSide,
    skill: metadata.skill ?? trajectory.skill,
    evaluation: metadata.evaluation ?? trajectory.evaluation,
    inferred: metadata.inferred ?? trajectory.inferred,
  };
}

export function getTrajectoryBounds(trajectory: BallTrajectory) {
  return trajectory.points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}

function getTouchPoint(touch: BallTouch | null | undefined): ScoutingPoint | null {
  return touch?.targetZone?.point ?? touch?.zone?.point ?? null;
}

export function reconstructBallTrajectoryForTouch(
  touch: BallTouch,
  previousTouch?: BallTouch | null,
): BallTrajectory | null {
  const startPoint = touch.originZone?.point ?? getTouchPoint(previousTouch);
  const endPoint = touch.targetZone?.point ?? touch.zone?.point ?? null;

  if (!startPoint || !endPoint) {
    return null;
  }

  return createBallTrajectory({
    id: `trajectory-inferred-${touch.id}`,
    rallyTouchId: touch.id,
    teamSide: touch.teamSide,
    skill: touch.skill,
    evaluation: touch.evaluation,
    points: [startPoint, endPoint],
    inferred: true,
  });
}

export function getBallTrajectoriesForTouches(touches: readonly BallTouch[]): BallTrajectory[] {
  return touches
    .map((touch, index) => touch.trajectory ?? reconstructBallTrajectoryForTouch(touch, touches[index - 1]))
    .filter((trajectory): trajectory is BallTrajectory => Boolean(trajectory));
}

export function filterBallTrajectories(
  trajectories: readonly BallTrajectory[],
  predicate: (trajectory: BallTrajectory) => boolean,
): BallTrajectory[] {
  return trajectories.filter(predicate);
}

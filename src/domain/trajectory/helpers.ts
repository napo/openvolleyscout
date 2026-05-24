import {
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_SURFACE_WIDTH,
  type ScoutingPoint,
} from '../spatial';
import type { BallTouch } from '../touch/types';
import type { BallDirection, BallTrajectory, BallTrajectoryPoint, StagePoint } from './types';

export const BALL_TRAJECTORY_MAX_POINTS = 24;
export const BALL_TRAJECTORY_MIN_POINT_DISTANCE = 1.15;

type TrajectoryMetadata = Pick<BallTrajectory, 'rallyTouchId' | 'teamSide' | 'skill' | 'evaluation' | 'inferred'>;
type StageElementLike = {
  getBoundingClientRect: () => Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
};
type ClientPointLike = Pick<PointerEvent, 'clientX' | 'clientY'> | Pick<MouseEvent, 'clientX' | 'clientY'> | {
  clientX: number;
  clientY: number;
};

type SimplifyOptions = {
  minDistance?: number;
  maxPoints?: number;
};

const loggedTrajectoryDiagnostics = new Set<string>();

function createTrajectoryId() {
  return `trajectory-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function logTrajectoryDiagnostic(kind: string, details?: unknown): void {
  if (!import.meta.env?.DEV) {
    return;
  }

  const key = `${kind}:${JSON.stringify(details)}`;
  if (loggedTrajectoryDiagnostics.has(key)) {
    return;
  }

  loggedTrajectoryDiagnostics.add(key);
  console.warn(`[OpenVolleyScout] Ball direction diagnostic: ${kind}`, details);
}

function isFiniteStagePoint(point: StagePoint | null | undefined): point is StagePoint {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function isStagePointInsideBounds(point: StagePoint): boolean {
  return point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100;
}

export function isValidStagePoint(point: StagePoint | null | undefined): point is StagePoint {
  return isFiniteStagePoint(point) && isStagePointInsideBounds(point);
}

export function assertValidStagePoint(
  point: StagePoint | null | undefined,
  label: string,
): point is StagePoint {
  if (isValidStagePoint(point)) {
    return true;
  }

  logTrajectoryDiagnostic('invalid_stage_point', {
    label,
    reason: !point
      ? 'missing'
      : !isFiniteStagePoint(point)
        ? 'nan_or_infinite'
        : 'outside_0_100',
    point,
  });

  return false;
}

export function normalizeStagePoint(point: StagePoint, label = 'stage_point'): StagePoint {
  assertValidStagePoint(point, label);

  return {
    x: Math.min(100, Math.max(0, Number.isFinite(point.x) ? point.x : 0)),
    y: Math.min(100, Math.max(0, Number.isFinite(point.y) ? point.y : 0)),
  };
}

export function clientPointToStagePoint(event: ClientPointLike, stageElement: StageElementLike): StagePoint {
  const rect = stageElement.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    logTrajectoryDiagnostic('zero_stage_rect', { rect });
    return { x: 0, y: 0 };
  }

  return normalizeStagePoint({
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  }, 'client_point_to_stage_point');
}

export function stagePointToSvgPoint(stagePoint: StagePoint): StagePoint {
  assertValidStagePoint(stagePoint, 'stage_point_to_svg_point');

  return {
    x: stagePoint.x,
    y: stagePoint.y,
  };
}

function toTrajectoryPoint(point: ScoutingPoint | BallTrajectoryPoint): BallTrajectoryPoint {
  const normalizedPoint = normalizeStagePoint(point, 'legacy_trajectory_point');

  return {
    x: normalizedPoint.x,
    y: normalizedPoint.y,
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

export function isPointOutsideScoutingCourt(point: StagePoint): boolean {
  return (
    point.x < SCOUTING_SURFACE_INSET_X
    || point.x > SCOUTING_SURFACE_INSET_X + SCOUTING_SURFACE_WIDTH
    || point.y < SCOUTING_SURFACE_INSET_Y
    || point.y > SCOUTING_SURFACE_INSET_Y + SCOUTING_SURFACE_HEIGHT
  );
}

export function createBallDirection(input: BallDirection): BallDirection {
  const start = normalizeStagePoint(input.start, 'ball_direction_start');
  const end = normalizeStagePoint(input.end, 'ball_direction_end');

  return {
    start,
    end,
    isOutsideCourtStart: input.isOutsideCourtStart ?? isPointOutsideScoutingCourt(start),
    isOutsideCourtEnd: input.isOutsideCourtEnd ?? isPointOutsideScoutingCourt(end),
    courtZoneStart: input.courtZoneStart,
    courtZoneEnd: input.courtZoneEnd,
  };
}

export function createBallDirectionFromPoints(
  points: readonly (ScoutingPoint | BallTrajectoryPoint)[],
): BallDirection | null {
  const simplifiedPoints = simplifyBallTrajectoryPoints(points);
  const firstPoint = simplifiedPoints[0];
  const lastPoint = simplifiedPoints.at(-1);

  if (!firstPoint || !lastPoint || simplifiedPoints.length < 2) {
    return null;
  }

  return createBallDirection({
    start: firstPoint,
    end: lastPoint,
  });
}

export function getBallDirectionForTrajectory(
  trajectory: (Partial<BallTrajectory> & { points?: BallTrajectoryPoint[] }) | null | undefined,
): BallDirection | null {
  if (!trajectory) {
    return null;
  }

  if (trajectory.direction) {
    return createBallDirection(trajectory.direction);
  }

  return trajectory.points ? createBallDirectionFromPoints(trajectory.points) : null;
}

export function getBallDirectionForTouch(touch: Pick<BallTouch, 'ballDirection' | 'trajectory'>): BallDirection | null {
  return touch.ballDirection
    ? createBallDirection(touch.ballDirection)
    : getBallDirectionForTrajectory(touch.trajectory);
}

export function getBallTrajectoryOutsideCourtPoints(trajectory: BallTrajectory): StagePoint[] {
  const direction = getBallDirectionForTrajectory(trajectory);

  return direction
    ? [direction.start, direction.end].filter(isPointOutsideScoutingCourt)
    : [];
}

export function createBallTrajectory(input: TrajectoryMetadata & {
  id?: string;
  direction?: BallDirection;
  points?: readonly (ScoutingPoint | BallTrajectoryPoint)[];
}): BallTrajectory | null {
  const legacyPoints = input.points ? simplifyBallTrajectoryPoints(input.points) : undefined;
  const direction = input.direction
    ? createBallDirection(input.direction)
    : legacyPoints
      ? createBallDirectionFromPoints(legacyPoints)
      : null;

  if (!direction) {
    return null;
  }

  return {
    id: input.id ?? createTrajectoryId(),
    rallyTouchId: input.rallyTouchId,
    teamSide: input.teamSide,
    skill: input.skill,
    evaluation: input.evaluation,
    direction,
    points: legacyPoints,
    inferred: input.inferred,
  };
}

export function normalizeBallTrajectory(
  trajectory: (Partial<BallTrajectory> & { points?: BallTrajectoryPoint[] }) | null | undefined,
  metadata: TrajectoryMetadata = {},
): BallTrajectory | null {
  if (!trajectory) {
    return null;
  }

  const direction = getBallDirectionForTrajectory(trajectory);

  if (!direction) {
    return null;
  }

  return {
    id: trajectory.id ?? createTrajectoryId(),
    rallyTouchId: metadata.rallyTouchId ?? trajectory.rallyTouchId,
    teamSide: metadata.teamSide ?? trajectory.teamSide,
    skill: metadata.skill ?? trajectory.skill,
    evaluation: metadata.evaluation ?? trajectory.evaluation,
    direction,
    points: trajectory.points ? simplifyBallTrajectoryPoints(trajectory.points) : undefined,
    inferred: metadata.inferred ?? trajectory.inferred,
  };
}

export function updateBallTrajectoryMetadata(
  trajectory: BallTrajectory,
  metadata: TrajectoryMetadata,
): BallTrajectory {
  return {
    ...trajectory,
    direction: createBallDirection(trajectory.direction),
    rallyTouchId: metadata.rallyTouchId ?? trajectory.rallyTouchId,
    teamSide: metadata.teamSide ?? trajectory.teamSide,
    skill: metadata.skill ?? trajectory.skill,
    evaluation: metadata.evaluation ?? trajectory.evaluation,
    inferred: metadata.inferred ?? trajectory.inferred,
  };
}

export function getTrajectoryBounds(trajectory: BallTrajectory) {
  const direction = getBallDirectionForTrajectory(trajectory);
  const points = direction ? [direction.start, direction.end] : [];

  return points.reduce((bounds, point) => ({
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
    direction: {
      start: startPoint,
      end: endPoint,
      courtZoneStart: touch.originZone?.zoneId,
      courtZoneEnd: touch.targetZone?.zoneId ?? touch.zone?.zoneId,
    },
    inferred: true,
  });
}

export function getBallTrajectoriesForTouches(touches: readonly BallTouch[]): BallTrajectory[] {
  return touches
    .map((touch, index) => {
      const direction = getBallDirectionForTouch(touch);

      if (direction) {
        return createBallTrajectory({
          id: touch.trajectory?.id ?? `trajectory-${touch.id}`,
          rallyTouchId: touch.id,
          teamSide: touch.teamSide,
          skill: touch.skill,
          evaluation: touch.evaluation,
          direction,
          inferred: touch.trajectory?.inferred,
        });
      }

      return reconstructBallTrajectoryForTouch(touch, touches[index - 1]);
    })
    .filter((trajectory): trajectory is BallTrajectory => Boolean(trajectory));
}

export function normalizeBallTouchDirection(touch: BallTouch): BallTouch {
  const ballDirection = getBallDirectionForTouch(touch);
  const trajectory = normalizeBallTrajectory(touch.trajectory, {
    rallyTouchId: touch.id,
    teamSide: touch.teamSide,
    skill: touch.skill,
    evaluation: touch.evaluation,
  }) ?? undefined;

  return {
    ...touch,
    ballDirection: ballDirection ?? touch.ballDirection,
    trajectory: trajectory ?? touch.trajectory,
  };
}

export function filterBallTrajectories(
  trajectories: readonly BallTrajectory[],
  predicate: (trajectory: BallTrajectory) => boolean,
): BallTrajectory[] {
  return trajectories.filter(predicate);
}

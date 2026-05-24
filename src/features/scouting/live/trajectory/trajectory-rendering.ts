import type { SkillType } from '@src/domain/common/enums';
import {
  getBallDirectionForTrajectory,
  stagePointToSvgPoint,
  type BallDirection,
  type BallTrajectory,
  type StagePoint,
} from '@src/domain/trajectory';

export type BallTrajectoryVisualStyle = {
  className: string;
  strokeWidth: number;
  opacity: number;
  dashArray?: string;
};

export type BallTrajectorySvgLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const DEFAULT_TRAJECTORY_DASH_ARRAY = '6 5';

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function formatPoint(point: StagePoint): string {
  const svgPoint = stagePointToSvgPoint(point);

  return `${formatCoordinate(svgPoint.x)} ${formatCoordinate(svgPoint.y)}`;
}

function getStyleForSkill(skill: SkillType | undefined): BallTrajectoryVisualStyle {
  switch (skill) {
    case 'serve':
      return {
        className: 'scouting-court__trajectory-path--serve',
        strokeWidth: 2,
        opacity: 0.68,
      };
    case 'attack':
      return {
        className: 'scouting-court__trajectory-path--attack',
        strokeWidth: 2.8,
        opacity: 0.72,
      };
    case 'freeball':
      return {
        className: 'scouting-court__trajectory-path--freeball',
        strokeWidth: 1.8,
        opacity: 0.56,
        dashArray: '6 5',
      };
    case 'set':
      return {
        className: 'scouting-court__trajectory-path--set',
        strokeWidth: 1.45,
        opacity: 0.5,
        dashArray: '3 5',
      };
    case 'dig':
      return {
        className: 'scouting-court__trajectory-path--dig',
        strokeWidth: 1.8,
        opacity: 0.58,
        dashArray: '2 4',
      };
    case 'receive':
      return {
        className: 'scouting-court__trajectory-path--receive',
        strokeWidth: 1.7,
        opacity: 0.54,
      };
    case 'cover':
      return {
        className: 'scouting-court__trajectory-path--cover',
        strokeWidth: 1.55,
        opacity: 0.5,
        dashArray: '4 5',
      };
    case 'block':
      return {
        className: 'scouting-court__trajectory-path--block',
        strokeWidth: 2,
        opacity: 0.52,
        dashArray: '3 3',
      };
    default:
      return {
        className: 'scouting-court__trajectory-path--default',
        strokeWidth: 1.75,
        opacity: 0.54,
      };
  }
}

export function getBallTrajectoryVisualStyle(trajectory: BallTrajectory): BallTrajectoryVisualStyle {
  const style = getStyleForSkill(trajectory.skill);
  const dashArray = style.dashArray ?? DEFAULT_TRAJECTORY_DASH_ARRAY;

  return trajectory.inferred
    ? {
        ...style,
        opacity: style.opacity * 0.7,
        dashArray,
      }
    : {
        ...style,
        dashArray,
      };
}

export function getBallDirectionRenderPoints(direction: BallDirection): [StagePoint, StagePoint] {
  return [
    stagePointToSvgPoint(direction.start),
    stagePointToSvgPoint(direction.end),
  ];
}

export function getBallTrajectoryRenderPoints(trajectory: BallTrajectory): StagePoint[] {
  const direction = getBallDirectionForTrajectory(trajectory);

  return direction ? getBallDirectionRenderPoints(direction) : [];
}

export function getBallDirectionSvgLine(direction: BallDirection): BallTrajectorySvgLine {
  const [start, end] = getBallDirectionRenderPoints(direction);

  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  };
}

export function getBallTrajectorySvgLine(trajectory: BallTrajectory): BallTrajectorySvgLine | null {
  const direction = getBallDirectionForTrajectory(trajectory);

  return direction ? getBallDirectionSvgLine(direction) : null;
}

export function createBallTrajectorySvgPath(trajectory: BallTrajectory): string {
  const points = getBallTrajectoryRenderPoints(trajectory);

  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${formatPoint(points[0])}`;
  }

  return `M ${formatPoint(points[0])} L ${formatPoint(points[1])}`;
}

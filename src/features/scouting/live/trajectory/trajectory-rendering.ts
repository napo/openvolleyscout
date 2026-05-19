import type { SkillType } from '@src/domain/common/enums';
import type { BallTrajectory, BallTrajectoryPoint } from '@src/domain/trajectory';

export type BallTrajectoryVisualStyle = {
  className: string;
  strokeWidth: number;
  opacity: number;
  dashArray?: string;
  arcStrength?: number;
};

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function formatPoint(point: BallTrajectoryPoint): string {
  return `${formatCoordinate(point.x)} ${formatCoordinate(point.y)}`;
}

function getPerpendicularControlPoint(
  start: BallTrajectoryPoint,
  end: BallTrajectoryPoint,
  strength: number,
): BallTrajectoryPoint {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return { x: midX, y: midY };
  }

  return {
    x: midX - (dy / distance) * strength,
    y: midY + (dx / distance) * strength,
  };
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
        arcStrength: 7,
      };
    case 'set':
      return {
        className: 'scouting-court__trajectory-path--set',
        strokeWidth: 1.45,
        opacity: 0.5,
        dashArray: '3 5',
        arcStrength: 4,
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

  return trajectory.inferred
    ? {
        ...style,
        opacity: style.opacity * 0.7,
        dashArray: style.dashArray ?? '5 5',
      }
    : style;
}

export function createBallTrajectorySvgPath(trajectory: BallTrajectory): string {
  const points = trajectory.points;

  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${formatPoint(points[0])}`;
  }

  const visualStyle = getBallTrajectoryVisualStyle(trajectory);
  if (points.length === 2 && visualStyle.arcStrength) {
    const controlPoint = getPerpendicularControlPoint(points[0], points[1], visualStyle.arcStrength);
    return `M ${formatPoint(points[0])} Q ${formatPoint(controlPoint)} ${formatPoint(points[1])}`;
  }

  if (points.length === 2) {
    return `M ${formatPoint(points[0])} L ${formatPoint(points[1])}`;
  }

  const [firstPoint, ...remainingPoints] = points;
  const commands = [`M ${formatPoint(firstPoint)}`];

  remainingPoints.slice(0, -1).forEach((point, index) => {
    const nextPoint = remainingPoints[index + 1];
    const midpoint = {
      x: (point.x + nextPoint.x) / 2,
      y: (point.y + nextPoint.y) / 2,
    };

    commands.push(`Q ${formatPoint(point)} ${formatPoint(midpoint)}`);
  });

  commands.push(`L ${formatPoint(points[points.length - 1])}`);

  return commands.join(' ');
}

import { memo, useMemo, type CSSProperties } from 'react';
import type { BallTrajectory } from '@src/domain/trajectory';
import {
  createBallTrajectorySvgPath,
  getBallTrajectoryVisualStyle,
} from '../live/trajectory/trajectory-rendering';

type BallTrajectoryOverlayProps = {
  trajectories: BallTrajectory[];
  activeTrajectory?: BallTrajectory | null;
};

export const BallTrajectoryOverlay = memo(function BallTrajectoryOverlay({
  trajectories,
  activeTrajectory,
}: BallTrajectoryOverlayProps) {
  const visibleTrajectories = useMemo(() => (
    activeTrajectory
      ? [
          ...trajectories.filter((trajectory) => trajectory.id !== activeTrajectory.id),
          activeTrajectory,
        ]
      : trajectories
  ), [activeTrajectory, trajectories]);

  if (visibleTrajectories.length === 0) {
    return null;
  }

  return (
    <svg
      className="scouting-court__trajectory-overlay"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="scouting-court__trajectory-arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="currentColor" />
        </marker>
      </defs>
      {visibleTrajectories.map((trajectory) => {
        const visualStyle = getBallTrajectoryVisualStyle(trajectory);
        const pathStyle = {
          '--trajectory-stroke-width': String(visualStyle.strokeWidth),
          '--trajectory-opacity': String(visualStyle.opacity),
          '--trajectory-dash-array': visualStyle.dashArray ?? 'none',
        } as CSSProperties;
        const className = [
          'scouting-court__trajectory-path',
          visualStyle.className,
          trajectory.id === activeTrajectory?.id ? 'is-active' : '',
          trajectory.inferred ? 'is-inferred' : '',
        ].filter(Boolean).join(' ');

        return (
          <path
            key={trajectory.id}
            className={className}
            style={pathStyle}
            d={createBallTrajectorySvgPath(trajectory)}
            markerEnd="url(#scouting-court__trajectory-arrow)"
          />
        );
      })}
    </svg>
  );
});

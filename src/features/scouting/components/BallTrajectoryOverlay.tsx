import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { logTrajectoryDiagnostic, type BallTrajectory } from '@src/domain/trajectory';
import {
  getBallTrajectorySvgLine,
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
  const overlayRef = useRef<SVGSVGElement>(null);
  const visibleTrajectories = useMemo(() => (
    activeTrajectory
      ? [
          ...trajectories.filter((trajectory) => trajectory.id !== activeTrajectory.id),
          activeTrajectory,
        ]
      : trajectories
  ), [activeTrajectory, trajectories]);

  useLayoutEffect(() => {
    const overlayElement = overlayRef.current;
    const stageElement = overlayElement?.parentElement;
    if (!overlayElement || !stageElement) {
      return;
    }

    const overlayRect = overlayElement.getBoundingClientRect();
    const stageRect = stageElement.getBoundingClientRect();
    const widthDelta = Math.abs(overlayRect.width - stageRect.width);
    const heightDelta = Math.abs(overlayRect.height - stageRect.height);

    if (widthDelta > 1 || heightDelta > 1) {
      logTrajectoryDiagnostic('svg_overlay_stage_mismatch', {
        overlay: {
          width: overlayRect.width,
          height: overlayRect.height,
        },
        stage: {
          width: stageRect.width,
          height: stageRect.height,
        },
      });
    }
  }, [visibleTrajectories.length]);

  if (visibleTrajectories.length === 0) {
    return null;
  }

  return (
    <svg
      ref={overlayRef}
      className="scouting-court__trajectory-overlay"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      overflow="hidden"
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
        const line = getBallTrajectorySvgLine(trajectory);

        if (!line) {
          return null;
        }

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
          <line
            key={trajectory.id}
            className={className}
            style={pathStyle}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            markerEnd="url(#scouting-court__trajectory-arrow)"
          />
        );
      })}
    </svg>
  );
});

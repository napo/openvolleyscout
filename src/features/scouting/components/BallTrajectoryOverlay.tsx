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

const MIN_VISIBLE_ACTIVE_LINE_LENGTH = 3;
const ZERO_LENGTH_THRESHOLD = 0.01;

function getSvgLineLength(line: NonNullable<ReturnType<typeof getBallTrajectorySvgLine>>): number {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

function getVisibleSvgLine(
  line: NonNullable<ReturnType<typeof getBallTrajectorySvgLine>>,
  isActive: boolean,
) {
  if (!isActive || getSvgLineLength(line) > ZERO_LENGTH_THRESHOLD) {
    return line;
  }

  return {
    ...line,
    x2: line.x1 <= 100 - MIN_VISIBLE_ACTIVE_LINE_LENGTH
      ? line.x1 + MIN_VISIBLE_ACTIVE_LINE_LENGTH
      : line.x1 - MIN_VISIBLE_ACTIVE_LINE_LENGTH,
  };
}

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

    visibleTrajectories.forEach((trajectory) => {
      const line = getBallTrajectorySvgLine(trajectory);
      if (line && getSvgLineLength(line) <= ZERO_LENGTH_THRESHOLD) {
        logTrajectoryDiagnostic('zero_length_svg_arrow', {
          trajectoryId: trajectory.id,
          start: { x: line.x1, y: line.y1 },
          end: { x: line.x2, y: line.y2 },
        });
      }
    });
  }, [visibleTrajectories]);

  if (visibleTrajectories.length === 0) {
    return null;
  }

  return (
    <svg
      ref={overlayRef}
      className="scouting-court__trajectory-overlay"
      width="100%"
      height="100%"
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
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="context-stroke" stroke="context-stroke" />
        </marker>
      </defs>
      {visibleTrajectories.map((trajectory) => {
        const visualStyle = getBallTrajectoryVisualStyle(trajectory);
        const line = getBallTrajectorySvgLine(trajectory);

        if (!line) {
          return null;
        }

        const isActive = trajectory.id === activeTrajectory?.id;
        const visibleLine = getVisibleSvgLine(line, isActive);
        const pathStyle = {
          '--trajectory-stroke-width': String(visualStyle.strokeWidth),
          '--trajectory-opacity': String(visualStyle.opacity),
          '--trajectory-dash-array': visualStyle.dashArray ?? 'none',
        } as CSSProperties;
        const className = [
          'scouting-court__trajectory-path',
          visualStyle.className,
          isActive ? 'is-active' : '',
          trajectory.inferred ? 'is-inferred' : '',
        ].filter(Boolean).join(' ');

        return (
          <line
            key={trajectory.id}
            className={className}
            style={pathStyle}
            x1={visibleLine.x1}
            y1={visibleLine.y1}
            x2={visibleLine.x2}
            y2={visibleLine.y2}
            data-trajectory-start={`${line.x1},${line.y1}`}
            data-trajectory-end={`${line.x2},${line.y2}`}
            data-trajectory-length={String(getSvgLineLength(line))}
            markerEnd="url(#scouting-court__trajectory-arrow)"
          />
        );
      })}
    </svg>
  );
});

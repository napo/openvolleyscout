import { useMemo, useState } from 'react';
import type { HeatmapEvent } from '../aggregation/heatmap-aggregation';
import { skillColor } from '../filters/heatmap-filters';

/**
 * DirectionMode - Renders heatmap as directional arrows on full-court horizontal layout.
 * Shows ball trajectory from start to end point with arrows.
 * Supports multi-point trajectories (deflections) and orientation toggle.
 */

// Stage coordinate constants
const STAGE_INSET = 12;
const STAGE_SIZE = 76;
const STAGE_HALF = STAGE_SIZE / 2;
const NET_Y = 50;

// Full-court SVG constants
const FC_VIEW_W = 160;
const FC_VIEW_H = 60;
const FC_INSET_X = 5;
const FC_INSET_Y = 8;
const FC_W = FC_VIEW_W - FC_INSET_X * 2;
const FC_H = FC_VIEW_H - FC_INSET_Y * 2;

// Coordinate transforms (full-court horizontal)
// Standard: home back at left, away back at right
function fcX(stageY: number): number {
  return FC_INSET_X + FC_W * (88 - stageY) / STAGE_SIZE;
}

function fcY(stageX: number): number {
  return FC_INSET_Y + FC_H * (stageX - STAGE_INSET) / STAGE_SIZE;
}

// Flipped orientation: home back at right, away back at left
function fcXFlipped(stageY: number): number {
  return FC_INSET_X + FC_W - (FC_W * (88 - stageY) / STAGE_SIZE);
}

const ARROW_MARKER_ID = 'heatmap-arrow-direction-mode';

export interface DirectionModeProps {
  events: HeatmapEvent[];
  homeLabel: string;
  awayLabel: string;
  hoveredEvent?: HeatmapEvent | null;
  onEventHover?: (event: HeatmapEvent | null) => void;
}

/**
 * Renders a full-court panel with directional arrows.
 * Home team on left, away team on right (from top-down view).
 * Supports multi-point trajectories (deflections).
 */
export function DirectionModePanel({
  events,
  homeLabel,
  awayLabel,
  hoveredEvent,
  onEventHover,
}: DirectionModeProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const midY = FC_INSET_Y + FC_H / 2;
  const netX = FC_INSET_X + FC_W / 2;
  const homeAtkX = FC_INSET_X + FC_W / 4;
  const awayAtkX = FC_INSET_X + (FC_W * 3) / 4;
  const topY = FC_INSET_Y;
  const bottomY = FC_INSET_Y + FC_H;

  const xTransform = isFlipped ? fcXFlipped : fcX;

  // Pre-compute trajectory paths for each event
  const trajectories = useMemo(() => {
    return events.map((ev) => {
      const color = skillColor(ev.skill);
      const isHovered = hoveredEvent && hoveredEvent.touchId === ev.touchId;

      // Start point
      const x1 = xTransform(ev.start.y);
      const y1 = fcY(ev.start.x);

      // Build path segments (main trajectory + any deflections)
      const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

      // Main trajectory: start → end (or start → first deflection point)
      if (ev.direction.via && ev.direction.via.length > 0) {
        // If there are deflection points, draw to first one
        const firstVia = ev.direction.via[0];
        const x2 = xTransform(firstVia.y);
        const y2 = fcY(firstVia.x);
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len >= 0.5) {
          segments.push({ x1, y1, x2, y2 });
        }

        // Draw segments between deflection points
        for (let i = 0; i < ev.direction.via.length - 1; i++) {
          const via1 = ev.direction.via[i];
          const via2 = ev.direction.via[i + 1];
          const vx1 = xTransform(via1.y);
          const vy1 = fcY(via1.x);
          const vx2 = xTransform(via2.y);
          const vy2 = fcY(via2.x);
          const len = Math.hypot(vx2 - vx1, vy2 - vy1);
          if (len >= 0.5) {
            segments.push({ x1: vx1, y1: vy1, x2: vx2, y2: vy2 });
          }
        }

        // Draw final segment: last deflection → end
        const lastVia = ev.direction.via[ev.direction.via.length - 1];
        const vx = xTransform(lastVia.y);
        const vy = fcY(lastVia.x);
        const endX2 = xTransform(ev.end.y);
        const endY2 = fcY(ev.end.x);
        const endLen = Math.hypot(endX2 - vx, endY2 - vy);
        if (endLen >= 0.5) {
          segments.push({ x1: vx, y1: vy, x2: endX2, y2: endY2 });
        }
      } else {
        // No deflections: direct trajectory
        const directX2 = xTransform(ev.end.y);
        const directY2 = fcY(ev.end.x);
        const directLen = Math.hypot(directX2 - x1, directY2 - y1);
        if (directLen >= 0.5) {
          segments.push({ x1, y1, x2: directX2, y2: directY2 });
        }
      }

      return { ev, color, isHovered, segments };
    });
  }, [events, hoveredEvent, xTransform]);

  // Filter trajectories with valid segments
  const validTrajectories = trajectories.filter((t) => t.segments.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
      {/* Orientation toggle button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '8px' }}>
        <button
          onClick={() => setIsFlipped(!isFlipped)}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: 'var(--color-surface-overlay, #1e293b)',
            color: 'var(--color-text-primary, #f1f5f9)',
            border: '1px solid var(--color-border, #334155)',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
          title={`Current: ${isFlipped ? awayLabel : homeLabel} on left`}
        >
          ⇄ Flip
        </button>
      </div>

      {/* Court SVG */}
      <svg
        viewBox={`0 0 ${FC_VIEW_W} ${FC_VIEW_H}`}
        style={{ width: '100%', height: 'auto', flex: 1 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Arrow marker definition */}
        <defs>
          <marker
            id={ARROW_MARKER_ID}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Court lines */}
        <g stroke="var(--heatmap-boundary-color, #94a3b8)" strokeWidth="0.5" fill="none">
          {/* Sidelines (left and right) */}
          <line x1={FC_INSET_X} y1={topY} x2={FC_INSET_X} y2={bottomY} />
          <line x1={FC_INSET_X + FC_W} y1={topY} x2={FC_INSET_X + FC_W} y2={bottomY} />

          {/* End lines (top and bottom) */}
          <line x1={FC_INSET_X} y1={topY} x2={FC_INSET_X + FC_W} y2={topY} />
          <line x1={FC_INSET_X} y1={bottomY} x2={FC_INSET_X + FC_W} y2={bottomY} />
        </g>

        {/* Net (vertical center line) */}
        <line
          x1={netX}
          y1={topY}
          x2={netX}
          y2={bottomY}
          stroke="var(--heatmap-net-color, #334155)"
          strokeWidth="1.5"
        />

        {/* Home attack line */}
        <line
          x1={homeAtkX}
          y1={topY}
          x2={homeAtkX}
          y2={bottomY}
          stroke="var(--heatmap-attack-line-color, #64748b)"
          strokeWidth="0.4"
          strokeDasharray="2 1.5"
        />

        {/* Away attack line */}
        <line
          x1={awayAtkX}
          y1={topY}
          x2={awayAtkX}
          y2={bottomY}
          stroke="var(--heatmap-attack-line-color, #64748b)"
          strokeWidth="0.4"
          strokeDasharray="2 1.5"
        />

        {/* Trajectory arrows */}
        <g>
          {validTrajectories.map(({ ev, color, isHovered, segments }) => (
            <g key={ev.touchId}>
              {/* Draw all segments for this trajectory */}
              {segments.map((seg, idx) => (
                <line
                  key={`${ev.touchId}-seg${idx}`}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={color}
                  strokeWidth={isHovered ? 1 : 0.5}
                  strokeOpacity={isHovered ? 0.8 : 0.5}
                  color={color}
                  markerEnd={`url(#${ARROW_MARKER_ID})`}
                  onMouseEnter={() => onEventHover?.(ev)}
                  onMouseLeave={() => onEventHover?.(null)}
                  style={{ cursor: 'default' }}
                />
              ))}

              {/* Deflection point markers (if any) */}
              {ev.direction.via && ev.direction.via.length > 0 && (
                <g opacity={isHovered ? 0.9 : 0.4}>
                  {ev.direction.via.map((via, vidx) => (
                    <circle
                      key={`${ev.touchId}-via${vidx}`}
                      cx={xTransform(via.y)}
                      cy={fcY(via.x)}
                      r={isHovered ? 1 : 0.6}
                      fill={color}
                      onMouseEnter={() => onEventHover?.(ev)}
                      onMouseLeave={() => onEventHover?.(null)}
                      style={{ cursor: 'default' }}
                    />
                  ))}
                </g>
              )}
            </g>
          ))}
        </g>

        {/* Team labels */}
        <text
          x={FC_INSET_X + FC_W / 4}
          y={midY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="4"
          fill="var(--heatmap-label-color, #94a3b8)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {isFlipped ? awayLabel : homeLabel}
        </text>
        <text
          x={FC_INSET_X + (FC_W * 3) / 4}
          y={midY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="4"
          fill="var(--heatmap-label-color, #94a3b8)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {isFlipped ? homeLabel : awayLabel}
        </text>
      </svg>
    </div>
  );
}

/**
 * Legend for direction mode showing skill colors and arrow indicator.
 */
export function DirectionModeLegend() {
  const skills = [
    { name: 'Serve', color: skillColor('serve') },
    { name: 'Receive', color: skillColor('receive') },
    { name: 'Attack', color: skillColor('attack') },
    { name: 'Block', color: skillColor('block') },
    { name: 'Dig', color: skillColor('dig') },
  ];

  return (
    <svg viewBox={`0 0 ${FC_VIEW_W} 15`} style={{ height: '40px', marginTop: '8px' }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker
          id={`${ARROW_MARKER_ID}-legend`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="3"
          markerHeight="3"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      <g>
        {skills.map((skill, i) => {
          const x = FC_INSET_X + (i * FC_W) / skills.length;
          const y = 8;
          return (
            <g key={skill.name}>
              {/* Arrow */}
              <line
                x1={x}
                y1={y}
                x2={x + 4}
                y2={y}
                stroke={skill.color}
                strokeWidth="1"
                color={skill.color}
                markerEnd={`url(#${ARROW_MARKER_ID}-legend)`}
              />
              {/* Label */}
              <text
                x={x + 6}
                y={y + 2}
                fontSize="2.5"
                fill="var(--heatmap-label-color, #94a3b8)"
              >
                {skill.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

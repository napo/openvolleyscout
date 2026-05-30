import type { HeatmapEvent } from '../aggregation/heatmap-aggregation';
import type { HeatmapEndpoint } from '../filters/heatmap-filters';
import { skillColor } from '../filters/heatmap-filters';

/**
 * PointMode - Renders heatmap as point cloud on half-court layouts.
 * Shows individual event locations as colored circles.
 */

// Stage coordinate constants
const STAGE_INSET = 12;
const STAGE_SIZE = 76;
const STAGE_HALF = STAGE_SIZE / 2;
const NET_Y = 50;

// Half-court SVG constants
const HC_VIEW_W = 50;
const HC_VIEW_H = 80;
const HC_INSET_X = 5;
const HC_INSET_Y = 8;
const HC_W = HC_VIEW_W - HC_INSET_X * 2;
const HC_H = HC_VIEW_H - HC_INSET_Y * 2;

// Coordinate transforms
function homeHcX(stageX: number): number {
  return HC_INSET_X + HC_W * (stageX - STAGE_INSET) / STAGE_SIZE;
}

function homeHcY(stageY: number): number {
  return HC_INSET_Y + HC_H * (stageY - NET_Y) / STAGE_HALF;
}

function awayHcX(stageX: number): number {
  return HC_INSET_X + HC_W * (stageX - STAGE_INSET) / STAGE_SIZE;
}

function awayHcY(stageY: number): number {
  return HC_INSET_Y + HC_H * (NET_Y - stageY) / STAGE_HALF;
}

export interface PointModeProps {
  events: HeatmapEvent[];
  endpoint: HeatmapEndpoint;
  teamSide: 'home' | 'away';
  teamLabel: string;
  hoveredEvent?: HeatmapEvent | null;
  onEventHover?: (event: HeatmapEvent | null) => void;
}

/**
 * Renders a single half-court panel with point cloud overlay.
 */
export function PointModePanel({
  events,
  endpoint,
  teamSide,
  teamLabel,
  hoveredEvent,
  onEventHover,
}: PointModeProps) {
  const toX = teamSide === 'home' ? homeHcX : awayHcX;
  const toY = teamSide === 'home' ? homeHcY : awayHcY;
  const teamEvents = events.filter((ev) => ev.teamSide === teamSide);

  return (
    <>
      {/* Court background */}
      <svg
        viewBox={`0 0 ${HC_VIEW_W} ${HC_VIEW_H}`}
        style={{ flex: 1, minWidth: 0 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Net */}
        <line
          x1={HC_INSET_X}
          y1={HC_INSET_Y}
          x2={HC_INSET_X + HC_W}
          y2={HC_INSET_Y}
          stroke="var(--heatmap-net-color, #334155)"
          strokeWidth="1.5"
        />

        {/* Attack line */}
        <line
          x1={HC_INSET_X}
          y1={HC_INSET_Y + HC_H / 3}
          x2={HC_INSET_X + HC_W}
          y2={HC_INSET_Y + HC_H / 3}
          stroke="var(--heatmap-attack-line-color, #64748b)"
          strokeWidth="0.4"
          strokeDasharray="2 1.5"
        />

        {/* Court boundary */}
        <rect
          x={HC_INSET_X}
          y={HC_INSET_Y}
          width={HC_W}
          height={HC_H}
          fill="none"
          stroke="var(--heatmap-boundary-color, #94a3b8)"
          strokeWidth="0.5"
        />

        {/* Point cloud overlay */}
        <g>
          {teamEvents.map((ev) => {
            const pt = endpoint === 'end' ? ev.end : ev.start;
            const color = skillColor(ev.skill);
            const isHovered = hoveredEvent && hoveredEvent.touchId === ev.touchId;

            return (
              <circle
                key={ev.touchId}
                cx={toX(pt.x)}
                cy={toY(pt.y)}
                r={isHovered ? 2 : 1.4}
                fill={color}
                fillOpacity={isHovered ? 0.8 : 0.55}
                stroke={color}
                strokeWidth={isHovered ? 0.4 : 0.2}
                strokeOpacity={isHovered ? 1 : 0.8}
                onMouseEnter={() => onEventHover?.(ev)}
                onMouseLeave={() => onEventHover?.(null)}
                style={{ cursor: 'default', transition: 'r 0.1s, fill-opacity 0.1s' }}
              />
            );
          })}
        </g>

        {/* Team label */}
        <text
          x={HC_INSET_X + HC_W / 2}
          y={HC_INSET_Y + HC_H + 3}
          textAnchor="middle"
          fontSize="3"
          fill="var(--heatmap-label-color, #94a3b8)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {teamLabel}
        </text>
      </svg>
    </>
  );
}

/**
 * Legend for point mode showing skill colors.
 */
export function PointModeLegend() {
  const skills = [
    { name: 'Serve', color: skillColor('serve') },
    { name: 'Receive', color: skillColor('receive') },
    { name: 'Attack', color: skillColor('attack') },
    { name: 'Block', color: skillColor('block') },
    { name: 'Dig', color: skillColor('dig') },
  ];

  return (
    <svg viewBox={`0 0 ${HC_VIEW_W} ${HC_VIEW_H + 10}`} style={{ height: '60px' }} preserveAspectRatio="xMidYMid meet">
      <g>
        {skills.map((skill, i) => {
          const x = HC_INSET_X + (i * HC_W) / skills.length;
          const y = HC_INSET_Y + HC_H + 2.5;
          return (
            <g key={skill.name}>
              <circle cx={x + 2} cy={y + 2.5} r={1.5} fill={skill.color} fillOpacity={0.7} />
              <text
                x={x + 6}
                y={y + 3}
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

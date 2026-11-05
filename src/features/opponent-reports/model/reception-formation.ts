/**
 * The opponent's reception line-up drawn on the formation of a reception
 * system (Systems page): for each rotation, the player who usually stood in
 * each court position is placed where that position's role stands in the
 * system, with her jersey number in the dot and her name beside it.
 * Pure module.
 */
import type { CourtPosition } from '@src/domain/common/enums';
import { getRoleCourtPositions } from '@src/domain/systems/formations';
import type { ReceptionRotation, ReceptionSystemBlock } from '@src/domain/systems/types';
import type { OpponentReportMetrics, Ratio } from './report-metrics';
import { trafficBand, type OpponentReportThresholds, type TrafficBand } from './traffic-light';

export interface FormationDot {
  position: CourtPosition;
  /** Half-court percentages: x from zone 4 (0) to zone 2 (100), y from the net (0) to the end line (100). */
  x: number;
  y: number;
  jersey: string;
  name: string;
  /** Her reception over the whole sample, from the opponent's point of view. */
  band: TrafficBand;
}

export interface ReceptionFormation {
  rotation: CourtPosition;
  receptions: number;
  receptionPositive: Ratio | null;
  dots: FormationDot[];
}

/** Where a court position stands when no system role matches it (plain grid). */
const FALLBACK_POINT: Record<CourtPosition, { x: number; y: number }> = {
  1: { x: 82, y: 75 }, 2: { x: 82, y: 22 }, 3: { x: 50, y: 22 }, 4: { x: 18, y: 22 }, 5: { x: 18, y: 75 }, 6: { x: 50, y: 75 },
};

export function buildReceptionFormations(
  metrics: OpponentReportMetrics,
  system: ReceptionSystemBlock,
  thresholds: OpponentReportThresholds,
): ReceptionFormation[] {
  const receivers = new Map(metrics.receivers.map((row) => [row.player.key, row.positive]));
  const rotationReception = new Map(metrics.rotations.map((row) => [row.rotation, row.receptionPositive]));

  return metrics.receptionLineups.map((lineup) => {
    const roleByPosition = new Map<CourtPosition, string>();
    getRoleCourtPositions(system.roleSequence, lineup.rotation as ReceptionRotation)
      .forEach((position, role) => roleByPosition.set(position, role));
    const systemRotation = system.rotations.find((entry) => entry.rotation === lineup.rotation);

    const dots = lineup.slots.map((slot) => {
      const role = roleByPosition.get(slot.position);
      const point = systemRotation?.positions.find((entry) => entry.role === role) ?? FALLBACK_POINT[slot.position];
      const reception = slot.player ? receivers.get(slot.player.key) : undefined;
      return {
        position: slot.position,
        x: point.x,
        y: point.y,
        jersey: slot.player?.jersey || '?',
        name: slot.player?.name ?? '',
        band: reception ? trafficBand(reception.rate, 'receptionPositive', thresholds, reception.total) : 'none' as TrafficBand,
      };
    });

    return {
      rotation: lineup.rotation,
      receptions: lineup.receptions,
      receptionPositive: rotationReception.get(lineup.rotation) ?? null,
      dots,
    };
  });
}

const DOT_FILL: Record<TrafficBand, string> = { green: '#16a34a', yellow: '#ca8a04', red: '#dc2626', none: '#475569' };

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

/** Surname, or the last word of the name, kept short for the drawing. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  return last.length > 14 ? `${last.slice(0, 13)}…` : last;
}

/**
 * Half court (net on top, thicker; dashed 3 m line) with one dot per player:
 * jersey number inside, surname beside. Self-contained SVG for screen and PDF.
 */
export function buildReceptionFormationSvg(formation: ReceptionFormation, labels: { title: string; net: string }): string {
  const width = 240;
  const top = 34;
  const side = 210;
  const margin = 15;
  const height = top + side + 10;
  const toX = (x: number) => margin + (x / 100) * side;
  const toY = (y: number) => top + (y / 100) * side;

  const dots = formation.dots.map((dot) => {
    const cx = toX(dot.x);
    const cy = toY(dot.y);
    const onRight = dot.x > 62;
    const name = shortName(dot.name);
    return [
      `<circle cx="${cx}" cy="${cy}" r="11" fill="${DOT_FILL[dot.band]}" stroke="#ffffff" stroke-width="1.5"/>`,
      `<text x="${cx}" y="${cy + 4}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(dot.jersey)}</text>`,
      name
        ? `<text x="${onRight ? cx - 14 : cx + 14}" y="${cy + 4}" font-size="9" fill="#111827" text-anchor="${onRight ? 'end' : 'start'}">${escapeXml(name)}</text>`
        : '',
    ].join('');
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${margin}" y="14" font-size="11" font-weight="bold" fill="#002554">${escapeXml(labels.title)}</text>`,
    `<rect x="${margin}" y="${top}" width="${side}" height="${side}" fill="#f6f8fb" stroke="#002554" stroke-width="1.5"/>`,
    `<line x1="${margin}" y1="${top + side / 3}" x2="${margin + side}" y2="${top + side / 3}" stroke="#002554" stroke-width="1" stroke-dasharray="4 3"/>`,
    `<line x1="${margin - 8}" y1="${top}" x2="${margin + side + 8}" y2="${top}" stroke="#002554" stroke-width="4"/>`,
    `<text x="${width / 2}" y="${top - 6}" font-size="9" fill="#002554" text-anchor="middle">${escapeXml(labels.net)}</text>`,
    ...dots,
    '</svg>',
  ].join('');
}

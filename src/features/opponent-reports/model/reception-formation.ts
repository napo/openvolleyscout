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
  /** Positive reception rate (0..1) when available. */
  positiveRate?: number | null;
  /** True when this receiver is the recommended serve target in this rotation. */
  isServeTarget?: boolean;
}

export interface ReceptionFormation {
  rotation: CourtPosition;
  receptions: number;
  receptionPositive: Ratio | null;
  dots: FormationDot[];
  /** Recommended serve target in this rotation, when one meets the minimum sample. */
  serveTarget?: {
    jersey: string;
    name: string;
    zone: string | null;
    rate: number | null;
    receptions: number;
  };
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
  const serveTargetsByRotation = new Map((metrics.serveTargets ?? []).map((target) => [target.rotation, target]));

  return metrics.receptionLineups.map((lineup) => {
    const roleByPosition = new Map<CourtPosition, string>();
    getRoleCourtPositions(system.roleSequence, lineup.rotation as ReceptionRotation)
      .forEach((position, role) => roleByPosition.set(position, role));
    const systemRotation = system.rotations.find((entry) => entry.rotation === lineup.rotation);

    const explicitTarget = serveTargetsByRotation.get(lineup.rotation);
    let targetPlayerKey: string | null = explicitTarget?.player.key ?? null;
    if (!targetPlayerKey) {
      const candidates = lineup.slots
        .map((slot) => ({
          key: slot.player?.key ?? null,
          reception: slot.player ? receivers.get(slot.player.key) : undefined,
        }))
        .filter((entry): entry is { key: string; reception: Ratio } =>
          entry.key !== null
          && entry.reception !== undefined
          && entry.reception.rate !== null
          && entry.reception.total >= thresholds.minSample,
        )
        .sort((left, right) => left.reception.rate! - right.reception.rate!);
      targetPlayerKey = candidates[0]?.key ?? null;
    }

    const dots = lineup.slots.map((slot) => {
      const role = roleByPosition.get(slot.position);
      const point = systemRotation?.positions.find((entry) => entry.role === role) ?? FALLBACK_POINT[slot.position];
      const reception = slot.player ? receivers.get(slot.player.key) : undefined;
      const isServeTarget = Boolean(targetPlayerKey && slot.player?.key === targetPlayerKey);
      return {
        position: slot.position,
        x: point.x,
        y: point.y,
        jersey: slot.player?.jersey || '?',
        name: slot.player?.name ?? '',
        band: reception ? trafficBand(reception.rate, 'receptionPositive', thresholds, reception.total) : 'none' as TrafficBand,
        positiveRate: reception?.rate ?? null,
        isServeTarget,
      };
    });

    const targetDot = dots.find((dot) => dot.isServeTarget);
    const targetRec = targetPlayerKey ? receivers.get(targetPlayerKey) : undefined;
    const serveTarget = targetDot
      ? {
        jersey: targetDot.jersey,
        name: targetDot.name,
        zone: explicitTarget?.zone ?? null,
        rate: explicitTarget?.positive.rate ?? targetRec?.rate ?? null,
        receptions: explicitTarget?.positive.total ?? targetRec?.total ?? 0,
      }
      : undefined;

    return {
      rotation: lineup.rotation,
      receptions: lineup.receptions,
      receptionPositive: rotationReception.get(lineup.rotation) ?? null,
      dots,
      ...(serveTarget ? { serveTarget } : {}),
    };
  });
}

const DOT_FILL: Record<TrafficBand, string> = { green: '#16a34a', yellow: '#ca8a04', red: '#dc2626', none: '#475569' };

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

/** Surname, or the last word of the name, kept short for the drawing. */
function shortName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || /^#\d+$/.test(trimmed)) return '';
  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  return last.length > 14 ? `${last.slice(0, 13)}…` : last;
}

/**
 * Half court (net on top, thicker; dashed 3 m line) with one dot per player:
 * jersey number inside, surname beside, and the recommended serve target
 * highlighted directly on the court with a serve arrow and target reticle.
 */
export function buildReceptionFormationSvg(formation: ReceptionFormation, labels: { title: string; net: string }): string {
  const width = 240;
  const top = 34;
  const side = 210;
  const margin = 15;
  const height = top + side + 10;
  const toX = (x: number) => margin + (x / 100) * side;
  const toY = (y: number) => top + (y / 100) * side;

  const targetExtras: string[] = [];
  const dots = formation.dots.map((dot) => {
    const cx = toX(dot.x);
    const cy = toY(dot.y);
    const onRight = dot.x > 62;
    const baseName = shortName(dot.name);
    const rateLabel = dot.isServeTarget && dot.positiveRate !== null && dot.positiveRate !== undefined
      ? `${Math.round(dot.positiveRate * 100)}%`
      : '';
    if (dot.isServeTarget) {
      const r = 15.5;
      targetExtras.push(
        `<line data-serve-target-arrow="${escapeXml(dot.jersey)}" x1="${cx.toFixed(1)}" y1="${top}" x2="${cx.toFixed(1)}" y2="${Math.max(top + 4, cy - 17).toFixed(1)}" stroke="#b91c1c" stroke-width="2.2" stroke-dasharray="4 2" marker-end="url(#formation-target-arrow)"/>`,
        `<path data-serve-target="${escapeXml(dot.jersey)}" d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 1 0 ${(cx + r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 1 0 ${(cx - r).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="#991b1b" stroke-width="2.2" stroke-dasharray="3 2"/>`,
      );
    }
    if (dot.band !== 'none') {
      const r = 13.5;
      const ringDash = dot.band === 'yellow' ? ' stroke-dasharray="4 2"' : dot.band === 'red' ? ' stroke-dasharray="1.5 2"' : '';
      const ringColor = dot.band === 'green' ? '#166534' : dot.band === 'yellow' ? '#854d0e' : '#991b1b';
      targetExtras.push(
        `<path data-band-ring="${dot.band}" d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 1 0 ${(cx + r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 1 0 ${(cx - r).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="${ringColor}" stroke-width="1.3"${ringDash}/>`,
      );
    }
    const labelX = onRight ? cx - 16 : cx + 16;
    const anchor = onRight ? 'end' : 'start';
    return [
      `<circle cx="${cx}" cy="${cy}" r="11" fill="${DOT_FILL[dot.band]}" stroke="#ffffff" stroke-width="1.5"/>`,
      `<text x="${cx}" y="${cy + 4}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(dot.jersey)}</text>`,
      baseName
        ? `<text x="${labelX}" y="${rateLabel ? cy : cy + 4}" font-size="9" font-weight="${dot.isServeTarget ? 'bold' : 'normal'}" fill="${dot.isServeTarget ? '#991b1b' : '#111827'}" text-anchor="${anchor}">${escapeXml(baseName)}</text>`
        : '',
      rateLabel
        ? `<text x="${labelX}" y="${cy + 10}" font-size="8" font-weight="bold" fill="#991b1b" text-anchor="${anchor}">${escapeXml(rateLabel)}</text>`
        : '',
    ].join('');
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    '<marker id="formation-target-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">',
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="#b91c1c"/>',
    '</marker>',
    '</defs>',
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${margin}" y="14" font-size="11" font-weight="bold" fill="#002554">${escapeXml(labels.title)}</text>`,
    `<rect x="${margin}" y="${top}" width="${side}" height="${side}" fill="#f6f8fb" stroke="#002554" stroke-width="1.5"/>`,
    `<line x1="${margin}" y1="${top + side / 3}" x2="${margin + side}" y2="${top + side / 3}" stroke="#002554" stroke-width="1" stroke-dasharray="4 3"/>`,
    `<line x1="${margin - 8}" y1="${top}" x2="${margin + side + 8}" y2="${top}" stroke="#002554" stroke-width="4"/>`,
    `<text x="${width / 2}" y="${top - 6}" font-size="9" fill="#002554" text-anchor="middle">${escapeXml(labels.net)}</text>`,
    ...targetExtras,
    ...dots,
    '</svg>',
  ].join('');
}

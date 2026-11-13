/**
 * The opponent's reception line-up drawn on the formation of a reception
 * system (Systems page): for each rotation, the player who usually stood in
 * each court position is placed where that position's role stands in the
 * system, with her jersey number in the dot and her name beside it.
 * Pure module.
 */
import { getZoneReferencePoint } from '@src/features/analytics/heatmaps/aggregation/zone-points';
import type { CourtPosition } from '@src/domain/common/enums';
import { getRoleCourtPositions } from '@src/domain/systems/formations';
import type { ReceptionRotation, ReceptionSystemBlock } from '@src/domain/systems/types';
import type { OpponentReportArrowShape, OpponentReportConeShape, OpponentReportDrawing } from '@src/domain/opponent-report/types';
import type { CustomLegendEntry } from './tactical-board';
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
  /** True when this player is the setter in this rotation (does not receive). */
  isSetter?: boolean;
}

export interface ReceptionFormation {
  rotation: CourtPosition;
  receptions: number;
  receptionPositive: Ratio | null;
  dots: FormationDot[];
  /** Recommended serve target in this rotation, when one meets the minimum sample. */
  targetArea?: { x: number; y: number };
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


    const dots = lineup.slots.map((slot) => {
      const role = roleByPosition.get(slot.position);
      const isSetter = role?.toLowerCase() === 'setter' || slot.position === lineup.rotation;
      const point = systemRotation?.positions.find((entry) => entry.role === role) ?? FALLBACK_POINT[slot.position];
      const reception = !isSetter && slot.player ? receivers.get(slot.player.key) : undefined;
      const isServeTarget = !isSetter && Boolean(targetPlayerKey && slot.player?.key === targetPlayerKey);
      return {
        position: slot.position,
        x: point.x,
        y: point.y,
        jersey: slot.player?.jersey || '?',
        name: slot.player?.name ?? '',
        band: reception ? trafficBand(reception.rate, 'receptionPositive', thresholds, reception.total) : 'none' as TrafficBand,
        positiveRate: reception?.rate ?? null,
        isServeTarget,
        ...(isSetter ? { isSetter: true } : {}),
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

    const zonePoint = explicitTarget?.zone && (explicitTarget.zoneActions ?? 0) >= thresholds.minSample
      ? getZoneReferencePoint(explicitTarget.zone, undefined, 'left') : null;
    return {
      ...(zonePoint ? { targetArea: { x: (zonePoint.y - 12) / 76 * 100, y: (50 - zonePoint.x) / 38 * 100 } } : {}),
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
export function buildReceptionFormationSvg(
  formation: ReceptionFormation,
  labels: { title: string; net: string },
  options?: { showNames?: boolean },
): string {
  const showNames = options?.showNames ?? true;
  const width = 240;
  const top = 34;
  const side = 210;
  const margin = 15;
  const height = top + side + 10;
  const toX = (x: number) => margin + (x / 100) * side;
  const toY = (y: number) => top + (y / 100) * side;

  const targetExtras: string[] = [];
  if (formation.targetArea) {
    targetExtras.push(`<ellipse data-serve-area="true" cx="${toX(formation.targetArea.x)}" cy="${toY(formation.targetArea.y)}" rx="24" ry="18" fill="#facc15" fill-opacity="0.3" stroke="#92400e" stroke-width="2" stroke-dasharray="5 3"/>`);
  }
  const dotCenters = formation.dots.map((dot) => ({ cx: toX(dot.x), cy: toY(dot.y) }));
  const placedBoxes: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  const boxesOverlap = (a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  const dots = formation.dots.map((dot, index) => {
    const { cx, cy } = dotCenters[index];
    const baseName = showNames ? shortName(dot.name) : '';
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
    if (dot.isSetter) {
      const r = 13.5;
      targetExtras.push(
        `<path data-setter-ring="${escapeXml(dot.jersey)}" d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 1 0 ${(cx + r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 1 0 ${(cx - r).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="#64748b" stroke-width="1.4" stroke-dasharray="3 2"/>`,
      );
    } else if (dot.band !== 'none') {
      const r = 13.5;
      const ringDash = dot.band === 'yellow' ? ' stroke-dasharray="4 2"' : dot.band === 'red' ? ' stroke-dasharray="1.5 2"' : '';
      const ringColor = dot.band === 'green' ? '#166534' : dot.band === 'yellow' ? '#854d0e' : '#991b1b';
      targetExtras.push(
        `<path data-band-ring="${dot.band}" d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 1 0 ${(cx + r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 1 0 ${(cx - r).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="${ringColor}" stroke-width="1.3"${ringDash}/>`,
      );
    }
    let labelXml = '';
    if (baseName || rateLabel) {
      const textWidth = Math.max(baseName.length * 5.2, rateLabel.length * 4.8) + 4;
      const halfW = textWidth / 2;
      const labelX = Math.max(margin + halfW + 2, Math.min(width - margin - halfW - 2, cx));
      const boxHeight = baseName && rateLabel ? 20 : 10;
      const candidates = [cy + 23, cy - 16, cy + 33, cy - 26, cy + 14];
      let chosenY = candidates[0];
      for (const candidateY of candidates) {
        const boxTop = candidateY - 8;
        const boxBottom = boxTop + boxHeight;
        if (boxTop < top + 2 || boxBottom > top + side - 2) continue;
        const box = { left: labelX - halfW, right: labelX + halfW, top: boxTop, bottom: boxBottom };
        const hitsOtherDot = dotCenters.some((other, otherIdx) =>
          otherIdx !== index
          && other.cx + 13 > box.left && other.cx - 13 < box.right
          && other.cy + 13 > box.top && other.cy - 13 < box.bottom,
        );
        const hitsLabel = placedBoxes.some((placed) => boxesOverlap(box, placed));
        if (!hitsOtherDot && !hitsLabel) {
          chosenY = candidateY;
          placedBoxes.push(box);
          break;
        }
      }
      if (!placedBoxes.some((placed) => placed.top === chosenY - 8 && placed.left === labelX - halfW)) {
        placedBoxes.push({ left: labelX - halfW, right: labelX + halfW, top: chosenY - 8, bottom: chosenY - 8 + boxHeight });
      }
      const nameEl = baseName
        ? `<text x="${labelX.toFixed(1)}" y="${chosenY.toFixed(1)}" font-size="9" font-weight="${dot.isServeTarget ? 'bold' : 'normal'}" fill="${dot.isServeTarget ? '#991b1b' : '#111827'}" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" text-anchor="middle">${escapeXml(baseName)}</text>`
        : '';
      const rateY = baseName ? chosenY + 10 : chosenY;
      const rateEl = rateLabel
        ? `<text x="${labelX.toFixed(1)}" y="${rateY.toFixed(1)}" font-size="8" font-weight="bold" fill="#991b1b" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" text-anchor="middle">${escapeXml(rateLabel)}</text>`
        : '';
      labelXml = `${nameEl}${rateEl}`;
    }
    const circleFill = dot.isSetter ? '#ffffff' : DOT_FILL[dot.band];
    const circleStroke = dot.isSetter ? '#64748b' : '#ffffff';
    const circleStrokeWidth = dot.isSetter ? '1.8' : '1.5';
    const jerseyFill = dot.isSetter ? '#334155' : '#ffffff';
    return [
      `<circle cx="${cx}" cy="${cy}" r="11" fill="${circleFill}" stroke="${circleStroke}" stroke-width="${circleStrokeWidth}"/>`,
      `<text x="${cx}" y="${cy + 4}" font-size="11" font-weight="bold" fill="${jerseyFill}" text-anchor="middle">${escapeXml(dot.jersey)}</text>`,
      labelXml,
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

export interface ServeTargetsLegendLabels {
  good: string;
  mid: string;
  weak: string;
  none: string;
  setter: string;
  target: string;
  zone: string;
  move?: string;
  courtNote: string;
}

function renderCustomLegendIcon(entry: CustomLegendEntry, x: number, y: number, markerId: string): string {
  const c = escapeXml(entry.color);
  if (entry.kind === 'player') {
    return `<circle cx="${x + 7}" cy="${y}" r="5.5" fill="${c}" stroke="#ffffff" stroke-width="1"/>`;
  }
  if (entry.kind === 'cone') {
    return `<polygon points="${x + 7},${y - 5} ${x + 1},${y + 5} ${x + 13},${y + 5}" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="1.2"/>`;
  }
  if (entry.kind === 'area') {
    return `<ellipse cx="${x + 9}" cy="${y}" rx="9" ry="5" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
  }
  if (entry.kind === 'text') {
    return `<text x="${x + 7}" y="${y + 3.5}" font-size="10" font-weight="bold" fill="${c}" text-anchor="middle">T</text>`;
  }
  const dash = entry.variant === 'move' ? ' stroke-dasharray="3.5 2.5"' : '';
  return `<line x1="${x}" y1="${y}" x2="${x + 18}" y2="${y}" stroke="${c}" stroke-width="${entry.variant === 'move' ? '1.5' : '2'}"${dash} marker-end="url(#${markerId})"/>`;
}

function renderCustomLegendRows(
  entries: readonly CustomLegendEntry[],
  startY: number,
  markerDefs: string[],
  elements: string[],
): number {
  if (!entries.length) return 0;
  const cols = 3;
  const colW = 232;
  const rowH = 18;
  entries.forEach((entry, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 14 + col * colW;
    const y = startY + row * rowH;
    const markerId = `legend-custom-arrow-${index}`;
    if (entry.kind === 'arrow') {
      const size = entry.variant === 'move' ? 4.2 : 5;
      markerDefs.push(
        `<marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeXml(entry.color)}"/></marker>`,
      );
    }
    const textX = entry.kind === 'arrow' || entry.kind === 'area' ? x + 24 : x + 18;
    elements.push(
      `${renderCustomLegendIcon(entry, x, y, markerId)}<text x="${textX}" y="${y + 3}" font-size="9.2" fill="#1e293b">${escapeXml(entry.label)}</text>`,
    );
  });
  return Math.ceil(entries.length / cols) * rowH;
}

/**
 * Compact visual icon legend for the "Serve targets" sheet, shared between
 * the interactive board sheet and the exported PDF booklet.
 */
export function buildServeTargetsLegendSvg(
  labels: ServeTargetsLegendLabels,
  hasMoveArrows = false,
  options?: { moveColor?: string; customEntries?: CustomLegendEntry[] },
): string {
  const width = 720;
  const customEntries = options?.customEntries ?? [];
  const moveColor = escapeXml(options?.moveColor ?? '#475569');
  const dotItems: Array<{ x: number; icon: string; label: string }> = [
    { x: 18, icon: '<circle cx="18" cy="18" r="6" fill="#16a34a" stroke="#ffffff" stroke-width="1.2"/>', label: labels.good },
    { x: 118, icon: '<circle cx="118" cy="18" r="6" fill="#ca8a04" stroke="#ffffff" stroke-width="1.2"/>', label: labels.mid },
    { x: 238, icon: '<circle cx="238" cy="18" r="6" fill="#dc2626" stroke="#ffffff" stroke-width="1.2"/>', label: labels.weak },
    { x: 344, icon: '<circle cx="344" cy="18" r="6" fill="#475569" stroke="#ffffff" stroke-width="1.2"/>', label: labels.none },
    {
      x: 454,
      icon: [
        '<circle cx="454" cy="18" r="8.5" fill="none" stroke="#64748b" stroke-width="1.1" stroke-dasharray="2.5 1.5"/>',
        '<circle cx="454" cy="18" r="6" fill="#ffffff" stroke="#64748b" stroke-width="1.4"/>',
      ].join(''),
      label: labels.setter,
    },
  ];

  const row2Items: Array<{ icon: string; xText: number; label: string }> = [
    {
      icon: [
        '<line x1="12" y1="38" x2="22" y2="38" stroke="#b91c1c" stroke-width="1.6" stroke-dasharray="3 1.5" marker-end="url(#legend-target-arrow)"/>',
        '<circle cx="31" cy="38" r="6.5" fill="none" stroke="#991b1b" stroke-width="1.4" stroke-dasharray="2.5 1.5"/>',
      ].join(''),
      xText: 43,
      label: labels.target,
    },
    {
      icon: '<ellipse cx="264" cy="38" rx="10" ry="5.5" fill="#facc15" fill-opacity="0.3" stroke="#92400e" stroke-width="1.4" stroke-dasharray="3 2"/>',
      xText: 280,
      label: labels.zone,
    },
  ];
  if (hasMoveArrows && labels.move) {
    row2Items.push({
      icon: `<line x1="484" y1="38" x2="508" y2="38" stroke="${moveColor}" stroke-width="1.5" stroke-dasharray="3.5 2.5" marker-end="url(#legend-move-arrow)"/>`,
      xText: 514,
      label: labels.move,
    });
  }

  const customMarkers: string[] = [];
  const customElements: string[] = [];
  const customHeight = renderCustomLegendRows(customEntries, 56, customMarkers, customElements);
  const height = 66 + customHeight;
  const noteY = 57 + customHeight;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    '<marker id="legend-target-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b91c1c"/></marker>',
    `<marker id="legend-move-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${moveColor}"/></marker>`,
    ...customMarkers,
    '</defs>',
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>`,
    ...dotItems.map((item) => `${item.icon}<text x="${item.x + 12}" y="21" font-size="9.5" fill="#1e293b">${escapeXml(item.label)}</text>`),
    ...row2Items.map((item) => `${item.icon}<text x="${item.xText}" y="41" font-size="9.5" fill="#1e293b">${escapeXml(item.label)}</text>`),
    ...customElements,
    `<text x="14" y="${noteY}" font-size="8.5" fill="#475569">${escapeXml(labels.courtNote)}</text>`,
    '</svg>',
  ].join('');
}

export interface AttackDefenseLegendLabels {
  primary: string;
  other: string;
  scoring: string;
  move?: string;
  courtNote: string;
}

/**
 * Compact visual icon legend for the "Block and defence" sheet, adapting colors
 * from edited drawings and appending any user-defined legend entries.
 */
export function buildAttackDefenseLegendSvg(
  labels: AttackDefenseLegendLabels,
  options?: { drawings?: Array<OpponentReportDrawing | undefined>; customEntries?: CustomLegendEntry[] },
): string {
  const width = 720;
  const drawings = options?.drawings ?? [];
  const customEntries = options?.customEntries ?? [];
  const allShapes = drawings.flatMap((d) => d?.shapes ?? []);
  const coneColors = allShapes
    .filter((s): s is OpponentReportConeShape => s.kind === 'cone' && !s.legendLabel?.trim() && Boolean(s.color))
    .map((s) => s.color!);
  const primaryColor = escapeXml(coneColors.find((c) => c.toLowerCase() !== '#2563eb') ?? '#dc2626');
  const otherColor = escapeXml(coneColors.find((c) => c.toLowerCase() !== primaryColor.toLowerCase()) ?? '#2563eb');
  const scoringShape = allShapes.find(
    (s): s is OpponentReportArrowShape => s.kind === 'arrow' && s.variant !== 'move' && !s.legendLabel?.trim() && Boolean(s.color),
  );
  const scoringColor = escapeXml(scoringShape?.color ?? '#111827');
  const moveShape = allShapes.find(
    (s): s is OpponentReportArrowShape => s.kind === 'arrow' && s.variant === 'move' && !s.legendLabel?.trim(),
  );
  const moveColor = moveShape ? escapeXml(moveShape.color ?? '#475569') : undefined;

  const items: Array<{ icon: string; xText: number; label: string }> = [
    {
      icon: `<polygon points="18,12 11,24 25,24" fill="${primaryColor}" fill-opacity="0.3" stroke="${primaryColor}" stroke-width="1.2"/>`,
      xText: 31,
      label: labels.primary,
    },
    {
      icon: `<polygon points="215,12 208,24 222,24" fill="${otherColor}" fill-opacity="0.25" stroke="${otherColor}" stroke-width="1.2"/>`,
      xText: 228,
      label: labels.other,
    },
    {
      icon: `<line x1="358" y1="18" x2="380" y2="18" stroke="${scoringColor}" stroke-width="2.2" marker-end="url(#atk-legend-arrow)"/>`,
      xText: 386,
      label: labels.scoring,
    },
  ];
  if (moveColor && labels.move) {
    items.push({
      icon: `<line x1="528" y1="18" x2="550" y2="18" stroke="${moveColor}" stroke-width="1.5" stroke-dasharray="3.5 2.5" marker-end="url(#atk-legend-move)"/>`,
      xText: 556,
      label: labels.move,
    });
  }

  const customMarkers: string[] = [];
  const customElements: string[] = [];
  const customHeight = renderCustomLegendRows(customEntries, 38, customMarkers, customElements);
  const height = 48 + customHeight;
  const noteY = 39 + customHeight;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    `<marker id="atk-legend-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${scoringColor}"/></marker>`,
    ...(moveColor ? [`<marker id="atk-legend-move" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${moveColor}"/></marker>`] : []),
    ...customMarkers,
    '</defs>',
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>`,
    ...items.map((item) => `${item.icon}<text x="${item.xText}" y="21" font-size="9.5" fill="#1e293b">${escapeXml(item.label)}</text>`),
    ...customElements,
    `<text x="14" y="${noteY}" font-size="8.5" fill="#475569">${escapeXml(labels.courtNote)}</text>`,
    '</svg>',
  ].join('');
}

export interface ServeHowLegendLabels {
  heat: string;
  routes: string;
  ace: string;
  move?: string;
}

/**
 * Compact visual icon legend for the "How they serve" sheet, adapting arrow
 * colors from edited drawings and appending any user-defined legend entries.
 */
export function buildServeHowLegendSvg(
  labels: ServeHowLegendLabels,
  options?: { drawings?: Array<OpponentReportDrawing | undefined>; customEntries?: CustomLegendEntry[] },
): string {
  const width = 720;
  const drawings = options?.drawings ?? [];
  const customEntries = options?.customEntries ?? [];
  const allShapes = drawings.flatMap((d) => d?.shapes ?? []);
  const routeShape = allShapes.find(
    (s): s is OpponentReportArrowShape => s.kind === 'arrow' && s.variant !== 'move' && !s.legendLabel?.trim() && Boolean(s.color),
  );
  const routeColor = escapeXml(routeShape?.color ?? '#1d4ed8');
  const moveShape = allShapes.find(
    (s): s is OpponentReportArrowShape => s.kind === 'arrow' && s.variant === 'move' && !s.legendLabel?.trim(),
  );
  const moveColor = moveShape ? escapeXml(moveShape.color ?? '#475569') : undefined;

  const items: Array<{ icon: string; xText: number; label: string }> = [
    {
      icon: [
        '<rect x="14" y="13" width="9" height="9" rx="1.5" fill="#fee2e2" stroke="#cbd5e1" stroke-width="0.6"/>',
        '<rect x="24" y="13" width="9" height="9" rx="1.5" fill="#f87171" stroke="#cbd5e1" stroke-width="0.6"/>',
        '<rect x="34" y="13" width="9" height="9" rx="1.5" fill="#dc2626" stroke="#cbd5e1" stroke-width="0.6"/>',
      ].join(''),
      xText: 49,
      label: labels.heat,
    },
    {
      icon: `<line x1="185" y1="18" x2="208" y2="18" stroke="${routeColor}" stroke-width="2" marker-end="url(#srv-legend-arrow)"/>`,
      xText: 214,
      label: labels.routes,
    },
    {
      icon: '<circle cx="385" cy="18" r="4.5" fill="#dc2626" stroke="#ffffff" stroke-width="1"/>',
      xText: 396,
      label: labels.ace,
    },
  ];
  if (moveColor && labels.move) {
    items.push({
      icon: `<line x1="490" y1="18" x2="512" y2="18" stroke="${moveColor}" stroke-width="1.5" stroke-dasharray="3.5 2.5" marker-end="url(#srv-legend-move)"/>`,
      xText: 518,
      label: labels.move,
    });
  }

  const customMarkers: string[] = [];
  const customElements: string[] = [];
  const customHeight = renderCustomLegendRows(customEntries, 38, customMarkers, customElements);
  const height = 34 + customHeight;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    `<marker id="srv-legend-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${routeColor}"/></marker>`,
    ...(moveColor ? [`<marker id="srv-legend-move" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${moveColor}"/></marker>`] : []),
    ...customMarkers,
    '</defs>',
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>`,
    ...items.map((item) => `${item.icon}<text x="${item.xText}" y="21" font-size="9.5" fill="#1e293b">${escapeXml(item.label)}</text>`),
    ...customElements,
    '</svg>',
  ].join('');
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Vector SVG chart renderers for the Team Review Booklet (radar, zone heatmaps,
 * attack direction fans, stacked evaluation bars, paired comparison bars, and
 * individual match trend polylines).
 */
import type { HeatmapEvent } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { DEFAULT_RADAR_AXIS_IDS, RADAR_AXES, type RadarValues } from '@src/features/analytics/radar/model/radar-metrics';
import { buildAttackerCourtSvg } from '@src/features/opponent-reports/model/report-view';

const INK = '#142e42';
const ACCENT = '#007e80';
const MUTED = '#64748b';
const GOOD = '#16a34a';
const WEAK = '#dc2626';

const xml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
const text = (x: number, y: number, value: string, size = 7, bold = false, fill = INK, anchor = 'start') =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}"${bold ? ' font-weight="bold"' : ''} fill="${fill}" text-anchor="${anchor}" xml:space="preserve">${xml(value)}</text>`;
const pct = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? '-' : `${Math.round(value * 100)}%`);

/** Normalises a radar axis value onto [0, 1] for polygon radius. */
function normalizeRadarAxis(axisId: string, raw: number | null | undefined): number {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return 0;
  const axis = RADAR_AXES.find((a) => a.id === axisId);
  if (!axis) return 0;
  const span = axis.theoreticalMax - axis.theoreticalMin;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (raw - axis.theoreticalMin) / span));
}

/** Splits a radar axis label into at most 2 clean lines at word boundaries (never chopping mid-word). */
function wrapRadarLabel(label: string, maxCharsPerLine: number): string[] {
  const trimmed = label.trim();
  if (trimmed.length <= maxCharsPerLine) return [trimmed];
  const words = trimmed.split(/\s+/);
  if (words.length <= 1) return [trimmed];
  let bestSplit = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const first = words.slice(0, i).join(' ');
    const second = words.slice(i).join(' ');
    const score = Math.max(first.length, second.length);
    if (score < bestScore) {
      bestScore = score;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
}

/** 5-axis vector Radar chart. When `secondaryValues` is passed, overlays Player over Team. */
export function renderRadarChartSvg(
  cx: number,
  cy: number,
  radius: number,
  primaryValues: RadarValues,
  axisLabels: Record<string, string>,
  options?: {
    secondaryValues?: RadarValues;
    primaryLabel?: string;
    secondaryLabel?: string;
    fontSize?: number;
    maxCharsPerLine?: number;
    bounds?: { minX: number; maxX: number };
  },
): string[] {
  const axes = DEFAULT_RADAR_AXIS_IDS;
  const count = axes.length;
  const out: string[] = [];
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / count;
  const fontSize = options?.fontSize ?? (radius < 45 ? 5.2 : 6.0);
  const maxCharsPerLine = options?.maxCharsPerLine ?? (radius < 45 ? 14 : 16);
  const lineH = fontSize + 1.4;
  const labelGapX = radius < 45 ? 6 : 10;
  const labelGapY = radius < 45 ? 7 : 10;

  // Concentric rings (25%, 50%, 75%, 100%)
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    const pts = axes.map((_, i) => {
      const a = angleFor(i);
      return `${(cx + Math.cos(a) * radius * ring).toFixed(1)},${(cy + Math.sin(a) * radius * ring).toFixed(1)}`;
    }).join(' ');
    out.push(`<polygon points="${pts}" fill="none" stroke="#cbd5e1" stroke-width="${ring === 1 ? 0.9 : 0.5}"/>`);
  }

  // Axis spokes and wrapped labels
  axes.forEach((axisId, i) => {
    const a = angleFor(i);
    const x2 = cx + Math.cos(a) * radius;
    const y2 = cy + Math.sin(a) * radius;
    out.push(`<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#cbd5e1" stroke-width="0.5"/>`);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let lx = cx + cos * (radius + labelGapX);
    const baseLy = cy + sin * (radius + labelGapY) + (sin < -0.5 ? -2 : 2);
    const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
    const labelLines = wrapRadarLabel(axisLabels[axisId] ?? axisId, maxCharsPerLine);
    const maxLineW = Math.max(...labelLines.map((l) => l.length)) * fontSize * 0.56;
    if (options?.bounds) {
      if (anchor === 'end' && lx - maxLineW < options.bounds.minX) {
        lx = options.bounds.minX + maxLineW;
      } else if (anchor === 'start' && lx + maxLineW > options.bounds.maxX) {
        lx = options.bounds.maxX - maxLineW;
      } else if (anchor === 'middle') {
        lx = Math.max(options.bounds.minX + maxLineW / 2, Math.min(options.bounds.maxX - maxLineW / 2, lx));
      }
    }
    const startY = labelLines.length > 1
      ? (sin < -0.5 ? baseLy - lineH : sin > 0.5 ? baseLy : baseLy - lineH / 2)
      : baseLy;
    labelLines.forEach((line, lineIdx) => {
      out.push(text(lx, startY + lineIdx * lineH, line, fontSize, true, INK, anchor));
    });
  });

  // Secondary polygon (Team reference when comparing)
  if (options?.secondaryValues) {
    const secPts = axes.map((axisId, i) => {
      const r = normalizeRadarAxis(axisId, options.secondaryValues![axisId]) * radius;
      const a = angleFor(i);
      return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
    out.push(`<polygon points="${secPts}" fill="#94a3b8" fill-opacity="0.22" stroke="#64748b" stroke-width="1.1" stroke-dasharray="3 2"/>`);
  }

  // Primary polygon (Team or Player)
  const priPts = axes.map((axisId, i) => {
    const r = normalizeRadarAxis(axisId, primaryValues[axisId]) * radius;
    const a = angleFor(i);
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  out.push(`<polygon points="${priPts}" fill="${ACCENT}" fill-opacity="0.28" stroke="${ACCENT}" stroke-width="1.4"/>`);

  // Compact legend below radar
  if (options?.primaryLabel) {
    const ly = cy + radius + (radius < 45 ? 24 : 26);
    const legendStartX = options.bounds ? Math.max(options.bounds.minX + 4, cx - radius) : cx - radius;
    out.push(`<rect x="${legendStartX.toFixed(1)}" y="${(ly - 5).toFixed(1)}" width="7" height="5" fill="${ACCENT}" fill-opacity="0.5" stroke="${ACCENT}" stroke-width="0.8"/>`);
    out.push(text(legendStartX + 10, ly, options.primaryLabel, 5.8, true, INK));
    if (options.secondaryLabel) {
      const secX = Math.max(legendStartX + 14 + options.primaryLabel.length * 3.6, cx + 4);
      out.push(`<rect x="${secX.toFixed(1)}" y="${(ly - 5).toFixed(1)}" width="7" height="5" fill="#94a3b8" fill-opacity="0.4" stroke="#64748b" stroke-width="0.8"/>`);
      out.push(text(secX + 10, ly, options.secondaryLabel, 5.8, false, MUTED));
    }
  }
  return out;
}

const STAGE_NET_X = 50;
const STAGE_HALF_DEPTH = 38;
const STAGE_INSET_Y = 12;
const STAGE_HEIGHT = 76;

/**
 * Maps a horizontal full-court StagePoint (x = depth across net at 50, y = width 12..88)
 * to DataVolley half-court zone 1..6 (front row 4/3/2, back row 5/6/1).
 * Matches `halfCourtToStageLeft` and `mirrorStagePoint` in `zone-points.ts`.
 */
export function pointToCourtZone(x: number, y: number): number {
  const isRightHalf = x > STAGE_NET_X;
  const halfY = (Math.abs(x - STAGE_NET_X) / STAGE_HALF_DEPTH) * 100;
  const halfX = isRightHalf
    ? ((100 - STAGE_INSET_Y - y) / STAGE_HEIGHT) * 100
    : ((y - STAGE_INSET_Y) / STAGE_HEIGHT) * 100;
  const isFront = halfY < 33.33;
  const col = halfX < 33.33 ? 0 : halfX < 66.67 ? 1 : 2;
  if (isFront) return col === 0 ? 4 : col === 1 ? 3 : 2;
  return col === 0 ? 5 : col === 1 ? 6 : 1;
}

const ZONE_MAP: Record<number, { col: number; row: number }> = {
  4: { col: 0, row: 0 },
  3: { col: 1, row: 0 },
  2: { col: 2, row: 0 },
  5: { col: 0, row: 1 },
  6: { col: 1, row: 1 },
  1: { col: 2, row: 1 },
};

/** Half-court 6-zone heatmap SVG with frequency shading, percentage, and count. */
export function renderZoneHeatmapCourtSvg(
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  events: readonly HeatmapEvent[],
  useEndZone: boolean,
  rgb = '0, 126, 128',
): string[] {
  const counts = new Map<number, number>([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]);
  let total = 0;
  for (const ev of events) {
    const pt = useEndZone ? ev.end : ev.start;
    const zone = pt ? pointToCourtZone(pt.x, pt.y) : NaN;
    if (Number.isFinite(zone) && zone >= 1 && zone <= 6) {
      counts.set(zone, (counts.get(zone) ?? 0) + 1);
      total += 1;
    }
  }
  const maxCount = Math.max(1, ...counts.values());
  const topPad = 14;
  const cw = w;
  const ch = h - topPad;
  const cellW = cw / 3;
  const frontH = ch * 0.34;
  const backH = ch - frontH;
  const out = [
    text(x, y + 9, `${title} (n=${total})`, 7, true, INK),
    `<rect x="${x}" y="${y + topPad}" width="${cw}" height="${ch}" fill="#f8fafc" stroke="${INK}" stroke-width="1"/>`,
  ];

  for (const [zone, pos] of Object.entries(ZONE_MAP)) {
    const z = Number(zone);
    const count = counts.get(z) ?? 0;
    const cx = x + pos.col * cellW;
    const cy = y + topPad + (pos.row === 0 ? 0 : frontH);
    const cellH = pos.row === 0 ? frontH : backH;
    const intensity = total > 0 ? 0.08 + (count / maxCount) * 0.58 : 0;
    if (count > 0) {
      out.push(`<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="rgb(${rgb})" fill-opacity="${intensity.toFixed(2)}"/>`);
    }
    out.push(`<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="none" stroke="#cbd5e1" stroke-width="0.6"/>`);
    out.push(text(cx + 3, cy + 8, `Z${z}`, 5.5, false, MUTED));
    if (total > 0) {
      const share = `${Math.round((count / total) * 100)}%`;
      out.push(text(cx + cellW / 2, cy + cellH / 2 + 2, share, 7.5, true, INK, 'middle'));
      out.push(text(cx + cellW / 2, cy + cellH / 2 + 10, `(${count})`, 5.2, false, MUTED, 'middle'));
    }
  }
  // Net line at top and 3m attack line
  out.push(`<line x1="${x}" y1="${y + topPad}" x2="${x + cw}" y2="${y + topPad}" stroke="${INK}" stroke-width="2.2"/>`);
  out.push(`<line x1="${x}" y1="${(y + topPad + frontH).toFixed(1)}" x2="${x + cw}" y2="${(y + topPad + frontH).toFixed(1)}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="3 2"/>`);
  return out;
}

/** Embeds the tactical attacker direction fans & scoring arrow SVG into a booklet box. */
export function renderAttackDirectionsSvg(
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  events: readonly HeatmapEvent[],
  legend: { fans: string; arrow: string; scoring: string },
): string[] {
  if (!events.length) return [];
  const raw = buildAttackerCourtSvg([...events], title, legend);
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const vb = raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 270 340';
  return [
    text(x, y + 9, `${title} (n=${events.length})`, 7, true, INK),
    `<svg x="${x}" y="${y + 12}" width="${w}" height="${h - 12}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`,
  ];
}

export interface EvalBarSegment {
  label: string;
  count: number;
  color: string;
}

/** Stacked horizontal evaluation bar with compact legend. */
export function renderStackedEvaluationBar(
  x: number,
  y: number,
  w: number,
  title: string,
  segments: readonly EvalBarSegment[],
): { elements: string[]; height: number } {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const out = [
    text(x, y + 8, `${title} (n=${total})`, 7, true, INK),
  ];
  const barY = y + 12;
  const barH = 12;
  if (total === 0) {
    out.push(`<rect x="${x}" y="${barY}" width="${w}" height="${barH}" rx="2" fill="#eef2f7"/>`);
  } else {
    let cursor = x;
    for (const seg of segments) {
      if (seg.count <= 0) continue;
      const sw = (seg.count / total) * w;
      out.push(`<rect x="${cursor.toFixed(1)}" y="${barY}" width="${sw.toFixed(1)}" height="${barH}" fill="${seg.color}"/>`);
      if (sw >= 18) {
        out.push(text(cursor + sw / 2, barY + 8.5, `${Math.round((seg.count / total) * 100)}%`, 5.8, true, '#ffffff', 'middle'));
      }
      cursor += sw;
    }
  }
  // Compact legend row
  let lx = x;
  const ly = barY + barH + 9;
  for (const seg of segments) {
    out.push(`<rect x="${lx}" y="${ly - 5}" width="6" height="6" rx="1" fill="${seg.color}"/>`);
    const lbl = `${seg.label} ${seg.count}`;
    out.push(text(lx + 8, ly, lbl, 5.6, false, INK));
    lx += Math.max(38, lbl.length * 3.5 + 14);
  }
  return { elements: out, height: 36 };
}

/** Paired horizontal bar chart (e.g. Current vs Benchmark, or Player vs Team). */
export function renderPairedBarsChart(
  x: number,
  y: number,
  w: number,
  title: string,
  rows: ReadonlyArray<{ label: string; current: number | null; benchmark: number | null; invertGood?: boolean }>,
  legendLabels: { current: string; benchmark: string },
): { elements: string[]; height: number } {
  const isWide = w >= 280;
  const labelW = isWide ? 128 : 88;
  const maxLabelChars = isWide ? 34 : 24;
  const valW = 46;
  const barMax = Math.max(36, w - labelW - valW);
  const rowH = 17;
  const benchTextW = legendLabels.benchmark.length * 3.1;
  const benchRectX = x + w - benchTextW - 9;
  const currTextX = benchRectX - 8;
  const currTextW = legendLabels.current.length * 3.1;
  const currRectX = currTextX - currTextW - 9;
  const out = [
    text(x, y + 9, title, 7.5, true, ACCENT),
    `<rect x="${currRectX.toFixed(1)}" y="${y + 3}" width="6" height="5" fill="${ACCENT}"/>`,
    text(currTextX, y + 8, legendLabels.current, 5.5, false, INK, 'end'),
    `<rect x="${benchRectX.toFixed(1)}" y="${y + 3}" width="6" height="5" fill="#94a3b8"/>`,
    text(x + w, y + 8, legendLabels.benchmark, 5.5, false, MUTED, 'end'),
  ];

  rows.forEach((row, idx) => {
    const ry = y + 16 + idx * rowH;
    const cVal = row.current ?? 0;
    const bVal = row.benchmark ?? 0;
    const cW = Math.max(0, Math.min(1, cVal)) * barMax;
    const bW = Math.max(0, Math.min(1, bVal)) * barMax;
    const diff = row.current !== null && row.benchmark !== null ? row.current - row.benchmark : null;
    const good = diff === null ? true : row.invertGood ? diff <= 0 : diff >= 0;
    const cFill = diff === null ? ACCENT : good ? GOOD : WEAK;

    const cleanLabel = row.label.length > maxLabelChars ? `${row.label.slice(0, maxLabelChars - 1)}…` : row.label;
    out.push(text(x, ry + 8, cleanLabel, 6.0, false, INK));
    out.push(`<rect x="${x + labelW}" y="${ry + 1}" width="${barMax}" height="5" rx="1" fill="#eef2f7"/>`);
    if (row.current !== null) {
      out.push(`<rect x="${x + labelW}" y="${ry + 1}" width="${cW.toFixed(1)}" height="5" rx="1" fill="${cFill}"/>`);
    }
    out.push(`<rect x="${x + labelW}" y="${ry + 7}" width="${barMax}" height="4" rx="1" fill="#eef2f7"/>`);
    if (row.benchmark !== null) {
      out.push(`<rect x="${x + labelW}" y="${ry + 7}" width="${bW.toFixed(1)}" height="4" rx="1" fill="#94a3b8"/>`);
    }
    out.push(text(x + w, ry + 8, `${pct(row.current)} / ${pct(row.benchmark)}`, 5.8, true, INK, 'end'));
  });

  return { elements: out, height: 18 + rows.length * rowH };
}

/** Individual player match-by-match polyline chart (Attack Kill% & Receive Pos%). */
export function renderPlayerTrendLineChart(
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  points: ReadonlyArray<{ label: string; attackKill: number | null; receivePos: number | null }>,
  legendLabels: { attack: string; receive: string },
): string[] {
  const plotTop = y + 14;
  const plotH = h - 24;
  const out = [
    text(x, y + 8, title, 7.5, true, ACCENT),
    `<rect x="${x}" y="${plotTop}" width="${w}" height="${plotH}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.5"/>`,
    `<line x1="${x}" y1="${plotTop + plotH / 2}" x2="${x + w}" y2="${plotTop + plotH / 2}" stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="2 2"/>`,
    text(x + w - 76, y + 8, legendLabels.attack, 5.5, true, ACCENT),
    text(x + w - 34, y + 8, legendLabels.receive, 5.5, true, '#d97706'),
  ];
  const px = (i: number) => x + 8 + (points.length <= 1 ? (w - 16) / 2 : (i / (points.length - 1)) * (w - 16));
  const py = (val: number) => plotTop + plotH - Math.max(0, Math.min(1, val)) * (plotH - 4) - 2;

  const drawSeries = (vals: Array<number | null>, stroke: string) => {
    const valid = vals.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null);
    if (valid.length > 1) {
      out.push(`<polyline fill="none" stroke="${stroke}" stroke-width="1.3" points="${valid.map((p) => `${px(p.i).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ')}"/>`);
    }
    valid.forEach((p) => out.push(`<circle cx="${px(p.i).toFixed(1)}" cy="${py(p.v).toFixed(1)}" r="1.8" fill="${stroke}"/>`));
  };

  drawSeries(points.map((p) => p.attackKill), ACCENT);
  drawSeries(points.map((p) => p.receivePos), '#d97706');
  return out;
}

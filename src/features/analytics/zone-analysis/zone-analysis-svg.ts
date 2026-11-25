// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A zone analysis court as a standalone SVG, for the tactical report, its PDF and booklet:
 * the half court with one box per zone (4 values, the main attackers), the red / black
 * frame on the lowest / highest first value and, for the served attacker, the setter box.
 *
 * Runs under ts-node too: relative and type-only imports only.
 */
import {
  zoneAnalysisCourtZones,
  zoneAnalysisExtremes,
  type ZoneAnalysisBox,
  type ZoneAnalysisGrid,
  type ZoneAnalysisResult,
  type ZoneAnalysisValue,
} from './zone-analysis';

const PERCENT_VALUES = new Set<ZoneAnalysisValue>(['totalPct', 'killPct', 'efficiency']);
/** Value colours as in DataVolley: black, blue, red, green. */
export const ZONE_SVG_VALUE_COLORS = ['#111827', '#1d4ed8', '#b91c1c', '#15803d'] as const;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
}

function format(value: ZoneAnalysisValue, v: number | null): string {
  if (v === null) return '-';
  return PERCENT_VALUES.has(value) ? `${Math.round(v * 100)}%` : String(v);
}

export interface ZoneCourtSvgOptions {
  title: string;
  values: readonly ZoneAnalysisValue[];
  grid?: ZoneAnalysisGrid;
  /** Draws the setter box (served attacker mode). */
  showSetterBox?: boolean;
  setterLabel: string;
  /** Short label of an attacker, e.g. "#7" or "Rossi". */
  playerLabel: (playerId: string) => string;
  /** Attackers listed per zone. */
  maxPlayers?: number;
}

export function buildZoneAnalysisCourtSvg(result: ZoneAnalysisResult, options: ZoneCourtSvgOptions): string {
  const grid = options.grid ?? 6;
  const maxPlayers = options.maxPlayers ?? 3;
  const width = 240;
  const margin = 10;
  const courtTop = 30;
  const rows = grid === 9 ? 3 : 2;
  const boxW = (width - margin * 2) / 3;
  const boxH = grid === 9 ? 62 : 86;
  const courtBottom = courtTop + boxH * rows;
  const setterH = options.showSetterBox ? 46 : 0;
  const height = courtBottom + setterH + 10;
  const extremes = zoneAnalysisExtremes(result, options.values[0]);

  const box = (b: ZoneAnalysisBox, x: number, y: number, w: number, h: number, tag: string) => {
    const parts: string[] = [];
    const frame = extremes.low === b.zone ? '#dc2626' : extremes.high === b.zone ? '#111827' : null;
    if (frame) parts.push(`<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="6" fill="none" stroke="${frame}" stroke-width="2"/>`);
    parts.push(`<text x="${x + w - 5}" y="${y + h - 5}" text-anchor="end" font-size="8" fill="#94a3b8">${escapeXml(tag)}</text>`);
    if (b.attacks.length > 0) {
      options.values.forEach((value, i) => {
        const vx = x + 8 + (i % 2) * (w / 2 - 4);
        const vy = y + 14 + Math.floor(i / 2) * 12;
        parts.push(`<text x="${vx}" y="${vy}" font-size="10" font-weight="bold" fill="${ZONE_SVG_VALUE_COLORS[i]}">${escapeXml(format(value, b.values[value]))}</text>`);
      });
      const lineH = 9;
      const firstLine = y + 14 + 24 + 2;
      const room = Math.max(0, Math.floor((y + h - 8 - firstLine) / lineH) + 1);
      b.players.slice(0, Math.min(maxPlayers, room)).forEach((p, i) => {
        parts.push(`<text x="${x + w / 2}" y="${firstLine + i * lineH}" text-anchor="middle" font-size="8" fill="#1f2937">${escapeXml(`${options.playerLabel(p.playerId)} ${p.count}`)}</text>`);
      });
    }
    return `<g data-zone="${escapeXml(b.zone)}"><title>${escapeXml(`${tag}: ${b.attacks.length}`)}</title>${parts.join('')}</g>`;
  };

  const zones = zoneAnalysisCourtZones(grid);
  const boxes = zones.map((zone, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return box(result.boxes[zone], margin + col * boxW, courtTop + row * boxH, boxW, boxH, zone);
  });
  const gridLines: string[] = [];
  for (let c = 1; c < 3; c += 1) {
    gridLines.push(`<line x1="${margin + c * boxW}" y1="${courtTop}" x2="${margin + c * boxW}" y2="${courtBottom}" stroke="#cbd5e1" stroke-dasharray="3 2"/>`);
  }
  for (let r = 1; r < rows; r += 1) {
    gridLines.push(`<line x1="${margin}" y1="${courtTop + r * boxH}" x2="${width - margin}" y2="${courtTop + r * boxH}" stroke="#cbd5e1" stroke-dasharray="3 2"/>`);
  }
  const setter = options.showSetterBox
    ? [
      `<rect x="${margin + 2 * boxW}" y="${courtBottom + 4}" width="${boxW}" height="${setterH - 6}" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="3 2"/>`,
      box(result.boxes.setter, margin + 2 * boxW, courtBottom + 4, boxW, setterH - 6, options.setterLabel),
    ].join('')
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(options.title)}</title>`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<text x="${margin}" y="19" font-size="12" font-weight="bold" fill="#002554">${escapeXml(options.title)}</text>`,
    `<text x="${width - margin}" y="19" text-anchor="end" font-size="9" fill="#475569">${result.total}</text>`,
    `<rect x="${margin}" y="${courtTop}" width="${width - margin * 2}" height="${courtBottom - courtTop}" fill="#f8fafc" stroke="#002554" stroke-width="1.2"/>`,
    ...gridLines,
    `<line x1="${margin - 5}" y1="${courtTop}" x2="${width - margin + 5}" y2="${courtTop}" stroke="#002554" stroke-width="3"/>`,
    ...boxes,
    setter,
    '</svg>',
  ].join('');
}

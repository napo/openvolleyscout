import type { TeamSide } from '@src/domain/common/enums';
import type { PlayByPlayRow, PlayByPlaySet } from './play-by-play';
import type { PlayByPlayDocumentInput } from './play-by-play-pdf';
import { playByPlayDetail, type PlayByPlayT } from './play-by-play-labels';

export const PLAY_BY_PLAY_CHART_WIDTH = 900;
export const PLAY_BY_PLAY_ROW_HEIGHT = 20;
export const PLAY_BY_PLAY_CHART_HEADER = 30;
export interface ScoreStep {
  row: PlayByPlayRow;
  difference: number;
  edge: number;
  left: number;
  right: number;
  unit: number;
}

/** One point per tile, oriented towards the leading team as in the reference. */
export function buildScoreSteps(rows: readonly PlayByPlayRow[], reference: TeamSide, maxGap?: number): ScoreStep[] {
  const sign = reference === 'home' ? 1 : -1;
  const peak = maxGap ?? Math.max(1, ...rows.map((row) => Math.abs(row.homeScore - row.awayScore)));
  const unit = Math.min(8, 140 / Math.max(1, peak));
  return rows.map((row) => {
    const difference = (row.homeScore - row.awayScore) * sign;
    const edge = 450 - difference * unit;
    return { row, difference, edge, left: Math.min(450, edge), right: Math.max(450, edge), unit };
  });
}

const xml = (value: unknown): string => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
function visibleLabel(value: string, width: number, size: number): string {
  let measured = 0;
  const characters = Array.from(value);
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index];
    measured += size * (/\p{M}/u.test(character) ? 0 : /[\u3000-\u9fff\uac00-\ud7af]/u.test(character) ? 1 : /[A-Z]/.test(character) ? .72 : /\s/.test(character) ? .3 : .57);
    if (measured > width - size) return characters.slice(0, Math.max(0, index - 1)).join('').trimEnd() + '…';
  }
  return value;
}
function text(x: number, y: number, value: string, options: { anchor?: string; size?: number; color?: string; bold?: boolean; width?: number } = {}): string {
  const size = options.size ?? 12;
  return `<text x="${x}" y="${y}" text-anchor="${options.anchor ?? 'start'}" font-size="${size}" fill="${options.color ?? '#111827'}"${options.bold ? ' font-weight="bold"' : ''}><title>${xml(value)}</title>${xml(options.width ? visibleLabel(value, options.width, size) : value)}</text>`;
}

/** Shared, continuous vector chart: web and PDF use identical point geometry. */
export function buildPlayByPlayChartSvg(input: PlayByPlayDocumentInput, set: PlayByPlaySet, t: PlayByPlayT, options: { compact?: boolean; rows?: readonly PlayByPlayRow[]; previousRotation?: number | null } = {}): string {
  const reference = input.options.reference;
  const other = reference === 'home' ? 'away' : 'home';
  const rows = options.rows ?? set.rows;
  const maxGap = Math.max(1, ...set.rows.map((row) => Math.abs(row.homeScore - row.awayScore)));
  const steps = buildScoreSteps(rows, reference, maxGap);
  const height = PLAY_BY_PLAY_CHART_HEADER + rows.length * PLAY_BY_PLAY_ROW_HEIGHT;
  const shapes = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}" direction="ltr" role="img" aria-label="${xml(t('pbpTitle'))}">`,
    `<rect width="900" height="${height}" fill="#ffffff"/>`,
    `<path d="M450 ${PLAY_BY_PLAY_CHART_HEADER}V${height}" stroke="#64748b" stroke-width="1"/>`,
    text(12, 16, 'P', { size: 11 }),
    text(34, 16, input.teams[reference].name, { width: 300, bold: true }),
    text(450, 16, t('pbpScore'), { anchor: 'middle', size: 10 }),
    text(880, 16, input.teams[other].name, { anchor: 'end', width: 300, bold: true }),
  ];
  let previousRotation = options.previousRotation ?? null;
  for (const [index, step] of steps.entries()) {
    const { row, left, right, unit } = step;
    const y = PLAY_BY_PLAY_CHART_HEADER + index * PLAY_BY_PLAY_ROW_HEIGHT;
    shapes.push(`<g data-row-id="${xml(row.id)}" data-kind="${row.kind}">`);
    const baseline = y + 14;
    const rotation = row.rotations[reference];
    if (rotation !== null && rotation !== previousRotation) {
      shapes.push(`<path d="M12 ${y}H438" stroke="#78977e" stroke-width=".65" stroke-dasharray="4 4"/>`, text(12, baseline, String(rotation), { size: 11, color: '#166534' }));
      previousRotation = rotation;
    }
    const fullDetail = playByPlayDetail(row, reference, input.teams, input.options, t, options.compact);
    const otherDetail = playByPlayDetail(row, other, input.teams, input.options, t, options.compact);
    if (row.kind === 'timeout') {
      shapes.push(`<rect x="408" y="${y}" width="84" height="20" fill="#fff"/>`, text(row.teamSide === reference ? 442 : 458, baseline, t('timeout'), { anchor: row.teamSide === reference ? 'end' : 'start', size: 10, color: '#166534' }));
      shapes.push('</g>');
      continue;
    }
    const color = row.kind === 'point' ? row.teamSide === reference ? '#b4b5cd' : '#feb6a0' : '#d1d5db';
    for (let tile = 0; tile < Math.abs(step.difference); tile++) shapes.push(`<rect data-point-tile="true" x="${left + tile * unit}" y="${y}" width="${unit}" height="20" fill="${color}" stroke="#ffffff" stroke-width=".45"/>`);
    const leftScore = left - 40;
    const rightScore = right + 40;
    shapes.push(`<path d="M${leftScore + 4} ${baseline - 3}H${left - 2} M${right + 2} ${baseline - 3}H${rightScore - 4}" stroke="#a3a3a3" stroke-width=".5" stroke-dasharray="3 3"/>`);
    if (row.kind === 'point' && row.servingTeam) {
      const server = input.teams[row.servingTeam].players.find((player) => player.id === row.serverId);
      const number = server && server.jerseyNumber > 0 ? `(${server.jerseyNumber})` : '(—)';
      shapes.push(text(row.servingTeam === reference ? left - 5 : right + 5, baseline, number, { anchor: row.servingTeam === reference ? 'end' : 'start', size: 9, color: '#475569' }));
    }
    const score = reference === 'home' ? `${row.homeScore} - ${row.awayScore}` : `${row.awayScore} - ${row.homeScore}`;
    const leftWinner = row.teamSide === reference;
    const scoreX = leftWinner ? leftScore : rightScore;
    shapes.push(text(scoreX, baseline, score, { anchor: leftWinner ? 'end' : 'start', size: 11, bold: true }));
    if (row.breakPoint) {
      const badgeX = leftWinner ? leftScore - Math.max(67, score.length * 6.5 + 26) : rightScore + Math.max(49, score.length * 6.5 + 8);
      shapes.push(`<rect x="${badgeX}" y="${y + 3}" width="17" height="13" rx="2" fill="#fff" stroke="#1d4ed8" stroke-width=".8"/>`, text(badgeX + 8.5, y + 13, 'BP', { anchor: 'middle', size: 9, color: '#1d4ed8', bold: true }));
    }
    const leftEnd = leftScore - Math.max(76, score.length * 6.5 + 32);
    const rightStart = rightScore + Math.max(76, score.length * 6.5 + 32);
    const failed = row.details[reference]?.evaluation === '=' || row.details[reference]?.evaluation === '/';
    const wonByError = leftWinner && !row.details[reference] && row.details[other]?.evaluation === '=';
    shapes.push(text(leftEnd, baseline, fullDetail, { anchor: 'end', width: leftEnd - 34, bold: leftWinner, color: failed ? '#b91c1c' : wonByError ? '#166534' : '#111827' }));
    shapes.push(text(rightStart, baseline, otherDetail || (row.kind === 'point' && !leftWinner ? t('pbpPoint') : ''), { width: 880 - rightStart, size: 11 }));
    shapes.push('</g>');
  }
  shapes.push('</svg>');
  return shapes.join('');
}

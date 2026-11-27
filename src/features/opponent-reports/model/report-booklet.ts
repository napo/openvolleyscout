import type { OpponentReport, OpponentReportBooklet, OpponentReportComponentId } from '@src/domain/opponent-report/types';
import { opponentReportTitle } from './report-title';
import { reportComponentOrder } from './report-components';
import { APP_METADATA } from '@src/lib/constants/app';
import { buildBoardPieceCatalog, resolveBoardPieces, PIECE_KEYS_MAIN, PIECE_TEAM_ROSTER, PIECE_TEAM_STARTS, PIECE_OVERVIEW_BREAK_REACTION, PIECE_RECEPTION_SERVE_TARGETS, setterPieceId, attackerPieceId, attackerPlayerKeyFromPieceId, attackerViewIdFromPieceId, servePieceId, type ResolvedBoardCourt, type ResolvedBoardPiece } from './board-pieces';
import { formatViewCell, type ReportView, type ViewT } from './report-view';
import { playerLabel } from './report-keys';
import { buildQrSvg } from './qr-svg';
import { buildAttackDefenseLegendSvg, buildCustomLegendSvg, buildServeHowLegendSvg, buildServeTargetsLegendSvg } from './reception-formation';
import { collectCustomLegendEntries, drawingHasMoveArrows, findMoveArrowColor } from './tactical-board';
import { videoLinkWatchKey } from './attacker-video-links';

export const BOOKLET_WIDTH = 419.528;
export const BOOKLET_HEIGHT = 595.276;
export const DEFAULT_BOOKLET: OpponentReportBooklet = { format: 'extended', base: 'extended', includeServe: true, includeServeReserves: false, includeAttackers: true, includeSecondSetter: false, includeBoardExtras: false };
const M = 20, TOP = 87;
const xml = (s: string) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
const color = '#142e42';

/** Conservative wrapping supports long names, manual newlines and CJK without truncation. */
export function wrapBookletText(text: string, width: number, size: number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '', used = 0;
    for (const token of paragraph.match(/\s+|[^\s]+/gu) ?? ['']) {
      const weight = (value: string) => [...value].reduce((n, ch) => n + (/[^\u0000-\u024f\u0600-\u06ff]/u.test(ch) ? 1.3 : /[MW@%]/.test(ch) ? .9 : /[il.,' :]/.test(ch) ? .34 : .65), 0) * size;
      if (used + weight(token) > width && line.trim()) { result.push(line.trimEnd()); line = ''; used = 0; }
      for (const ch of token) {
        const w = weight(ch);
        if (used + w > width && line) { result.push(line.trimEnd()); line = ''; used = 0; }
        if (!line && /\s/.test(ch)) continue;
        line += ch; used += w;
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}
function text(x: number, y: number, value: string, size = 8, bold = false, fill = color): string {
  return `<text x="${x}" y="${y}" font-size="${size}"${bold ? ' font-weight="bold"' : ''} fill="${fill}" xml:space="preserve">${xml(value)}</text>`;
}
function lines(x: number, y: number, value: string, width: number, size = 8): string[] {
  return wrapBookletText(value, width, size).map((line, i) => text(x, y + i * size * 1.4, line, size));
}
/** Reuse the entire SVG and apply ONE scale to both axes, including edited drawings. */
export function fitBookletCourt(svg: string, x: number, y: number, width: number, height: number, namespace: string): string {
  const vb = svg.match(/viewBox=["']([^"']+)["']/)?.[1].split(/[ ,]+/).map(Number);
  const sw = vb?.[2] ?? Number(svg.match(/\bwidth=["']([\d.]+)/)?.[1] ?? 240);
  const sh = vb?.[3] ?? Number(svg.match(/\bheight=["']([\d.]+)/)?.[1] ?? 270);
  const scale = Math.min(width / Math.max(1, sw), height / Math.max(1, sh));
  const ids = new Map([...svg.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => [match[1], `${namespace}-${match[1]}`]));
  let content = svg;
  for (const [id, next] of ids) {
    content = content.replaceAll(`id="${id}"`, `id="${next}"`).replaceAll(`id='${id}'`, `id='${next}'`).replaceAll(`url(#${id})`, `url(#${next})`).replaceAll(`href="#${id}"`, `href="#${next}"`);
  }
  return `<g transform="translate(${x + (width - sw * scale) / 2} ${y + (height - sh * scale) / 2}) scale(${scale})">${content}</g>`;
}
interface Page { title: string; elements: string[]; component: OpponentReportComponentId }

/** The highest bars; on a tie, the one used most in the latest matches, if that settles it. */
function highestBars(values: readonly number[], recent: readonly number[] | undefined): { bars: Set<number>; tieBrokenBy?: number } {
  const highest = Math.max(0, ...values);
  if (highest === 0) return { bars: new Set() };
  const tied = values.flatMap((value, i) => (value === highest ? [i] : []));
  if (tied.length === 1 || !recent) return { bars: new Set(tied) };
  const best = Math.max(...tied.map((i) => recent[i] ?? 0));
  const winners = tied.filter((i) => (recent[i] ?? 0) === best);
  return best > 0 && winners.length === 1 ? { bars: new Set(winners), tieBrokenBy: winners[0] } : { bars: new Set(tied) };
}

/** A small horizontal bar chart: one row per label, the count at the end of its bar; grey bars, the chosen ones in the report's accent, an optional note below. */
function bookletBarChart(x: number, y: number, width: number, height: number, title: string, labels: readonly string[], values: readonly number[], max: number, highlighted: ReadonlySet<number>, note: string, colors: { bar: string; highlight: string }): string {
  const parts = [text(x, y + 8, title, 8, true)];
  const top = y + 16, labelWidth = 22, valueWidth = 16;
  const row = (height - 16) / Math.max(1, values.length), barHeight = Math.min(16, row * 0.62);
  const barSpace = width - labelWidth - valueWidth;
  parts.push(`<line x1="${x + labelWidth}" y1="${top}" x2="${x + labelWidth}" y2="${top + row * values.length}" stroke="#94a3b8" stroke-width=".6"/>`);
  values.forEach((value, i) => {
    const middle = top + row * i + row / 2;
    const barWidth = max > 0 ? barSpace * value / max : 0;
    parts.push(`<text x="${x}" y="${middle + 2.5}" font-size="7" fill="${color}">${xml(labels[i] ?? '')}</text>`);
    if (barWidth > 0) parts.push(`<rect x="${x + labelWidth}" y="${middle - barHeight / 2}" width="${barWidth}" height="${barHeight}" fill="${highlighted.has(i) ? colors.highlight : colors.bar}" rx="1.5"/>`);
    parts.push(`<text x="${x + labelWidth + barWidth + 3}" y="${middle + 2.5}" font-size="7" font-weight="bold" fill="${color}">${value}</text>`);
  });
  if (note) parts.push(text(x, y + height + 8, note, 6.5, true, colors.highlight));
  return parts.join('');
}


export const TEAM_CHART_BAR = '#cbd5e1';
export const TEAM_CHART_HIGHLIGHT = '#007e80';

/**
 * The starting rotations of the Team page, drawn the same in the booklet and in the editor: two bar charts
 * (on serve, on reception), or with one match only the rotations written out. Below, what they are counted on
 * and the coach's note.
 */
export function teamStartsElements(x: number, y: number, width: number, height: number, piece: Pick<ResolvedBoardPiece, 'table' | 'subtitle'>, team: ReportView['team'], colors: { bar?: string; highlight?: string } | undefined, t: ViewT): string {
  const table = piece.table;
  if (!table) return '';
  const bar = colors?.bar || TEAM_CHART_BAR, highlight = colors?.highlight || TEAM_CHART_HIGHLIGHT;
  const labels = table.rows.map((row) => formatViewCell(row[0]));
  const counts = (column: number) => table.rows.map((row) => Math.max(0, Number.parseInt(formatViewCell(row[column]), 10) || 0));
  const serve = counts(1), receive = counts(2), max = Math.max(1, ...serve, ...receive);
  const noteLines = [team?.basis ?? '', piece.subtitle ?? ''].filter(Boolean).flatMap((line) => wrapBookletText(line, width, 6));
  const chartHeight = height - noteLines.length * 8 - 6, chartWidth = (width - 14) / 2;
  const parts: string[] = [];
  const recent = team?.recent;
  ([[1, serve], [2, receive]] as const).forEach(([column, values], index) => {
    const left = x + index * (chartWidth + 14);
    if (team?.singleMatch) {
      // One match: no chart, the rotation(s) it started in.
      const used = values.flatMap((value, i) => (value > 0 ? [{ label: labels[i], value }] : [])).sort((a, b) => b.value - a.value);
      parts.push(text(left, y + 8, table.columns[column] ?? '', 8, true));
      const written = used.length === 1 ? used[0].label : used.map((entry) => `${entry.label} (${entry.value})`).join(' · ');
      parts.push(text(left, y + 34, written || '-', used.length === 1 ? 24 : 13, true, highlight));
      return;
    }
    const { bars, tieBrokenBy } = highestBars(values, column === 1 ? recent?.serve : recent?.receive);
    const note = tieBrokenBy !== undefined && recent
      ? t(recent.matches === 1 ? 'teamStartsTieNoteOne' : 'teamStartsTieNote', { rotation: labels[tieBrokenBy], n: recent.matches })
      : '';
    parts.push(bookletBarChart(left, y, chartWidth, chartHeight - 10, table.columns[column] ?? '', labels, values, max, bars, note, { bar, highlight }));
  });
  noteLines.forEach((line, i) => parts.push(text(x, y + height - noteLines.length * 8 + 6 + i * 8, line, 6, false, '#475569')));
  return parts.join('');
}
type SetterGroup = ReportView['setter']['groups'][number];
/** Setters in print order: most touches of every skill first, then most sets. */
export function rankSetterGroups<G extends Pick<SetterGroup, 'player' | 'attempts' | 'touches'>>(groups: readonly G[]): G[] {
  return [...groups].sort((a, b) => (b.touches ?? b.attempts ?? 0) - (a.touches ?? a.attempts ?? 0)
    || (b.attempts ?? 0) - (a.attempts ?? 0) || a.player.key.localeCompare(b.player.key));
}
/** Setters printed with charts: the coach's choice, else every setter (old switch) or the first one. */
export function chartedSetterKeys(booklet: Partial<OpponentReportBooklet> | undefined, groups: readonly Pick<SetterGroup, 'player' | 'attempts' | 'touches'>[]): string[] {
  const ranked = rankSetterGroups(groups).map((group) => group.player.key);
  if (booklet?.setterChartKeys) return ranked.filter((key) => booklet.setterChartKeys!.includes(key));
  return booklet?.includeSecondSetter ? ranked : ranked.slice(0, 1);
}
interface Card { title: string; court?: ResolvedBoardCourt; body?: string; bandKey?: string; descriptionBelow?: boolean; descriptionLineLimit?: number; qrSvg?: string; note?: { id: string; body: string } }
export interface ReportStaffNote { id: string; title: string; body: string }
export interface ReportBookletPlan {
  staffNotes?: ReportStaffNote[];
  pages: string[];
  width?: number;
  height?: number;
  contentPages: number;
  paddingPages: number;
  sheets: number;
  format: OpponentReportBooklet;
}

/** Same plan drives the source-selection count, preview, A5 PDF and A4 imposition. */
export function buildReportBooklet(report: OpponentReport, view: ReportView, t: ViewT, sampleLine = '', options: { a4?: boolean; matchLines?: string[] } = {}): ReportBookletPlan {
  const a4 = options.a4 === true;
  const pageWidth = a4 ? 595.276 : BOOKLET_WIDTH;
  const pageHeight = a4 ? 841.89 : BOOKLET_HEIGHT;
  const WIDTH = pageWidth - M * 2, BOTTOM = pageHeight - 37;
  const settings = { ...DEFAULT_BOOKLET, ...report.booklet };
  const compact = !a4 && (settings.format === 'compact' || settings.format === 'custom' && settings.base === 'compact');
  const custom = settings.format === 'custom';
  const catalog = buildBoardPieceCatalog(report, view, t);
  const pages: Page[] = [];
  const deferred: Array<{ id?: string; title: string; body: string; inBox?: boolean }> = [];
  // Notes printed in full in the box beside their court: still editable, not repeated in the staff notes.
  const notesInBox = new Set<string>();
  let component: OpponentReportComponentId = 'keys';
  const add = (title: string): Page => { const page = { title, elements: [] as string[], component }; pages.push(page); return page; };
  const prose = (title: string, paragraphs: Array<{ body: string; primary?: boolean; label?: string }>) => {
    let page = add(title), y = TOP;
    for (const paragraph of paragraphs) {
      const content = wrapBookletText(paragraph.body, WIDTH - 18, 8.5);
      const capacity = Math.floor((BOTTOM - TOP - 32) / 12);
      for (let offset = 0; offset < Math.max(1, content.length); offset += capacity) {
        const section = content.slice(offset, offset + capacity);
        const height = Math.max(34, section.length * 12 + (paragraph.label ? 25 : 16));
        if (y + height > BOTTOM) { page = add(title); y = TOP; }
        if (paragraph.primary) page.elements.push(`<rect x="${M}" y="${y}" width="${WIDTH}" height="${height}" rx="5" fill="#eaf3f3"/>`);
        if (paragraph.label) page.elements.push(text(M + 8, y + 13, paragraph.label, 8, true, '#007e80'));
        const baseline = y + (paragraph.label ? 27 : 15);
        page.elements.push(...section.map((line, index) => text(M + 8, baseline + index * 12, line, 8.5)));
        y += height + 8;
      }
    }
  };
  const grids = (title: string, cards: Card[], columns: number, rows: number, bottom = BOTTOM, legend = '', bandHeadings?: Record<string, string>) => {
    const legendLines = legend ? wrapBookletText(legend, WIDTH, 6) : [];
    const top = TOP + (legendLines.length ? legendLines.length * 8 + 6 : 0);
    const capacity = columns * rows;
    if (!cards.length) { prose(title, [{ body: t('bookletMissing') }]); return; }
    const cw = (WIDTH - (columns - 1) * 10) / columns, ch = (bottom - top - (rows - 1) * 10 - (bandHeadings ? 32 : 0)) / rows;
    for (let start = 0; start < cards.length; start += capacity) {
      const page = add(title);
      page.elements.push(...legendLines.map((line, i) => text(M, TOP + 6 + i * 8, line, 6)));
      cards.slice(start, start + capacity).forEach((card, i) => {
        const x = M + (i % columns) * (cw + 10), y = top + Math.floor(i / columns) * (ch + 10) + (bandHeadings ? (Math.floor(i / (columns * 2)) + 1) * 16 : 0);
        if (bandHeadings && card.bandKey && i % (columns * 2) === 0) {
          const heading = bandHeadings[card.bandKey];
          if (heading) page.elements.push(text(M, y - 4, heading, 8, true, '#007e80'));
        }
        const qrSize = card.qrSvg ? (a4 ? 26 : 22) : 0;
        const fullLabel = wrapBookletText(card.title, cw - 10 - (qrSize ? qrSize + 4 : 0), 7.2);
        const labelLines = fullLabel.length > 3 ? fullLabel.slice(0, 2).concat(['…']) : fullLabel;
        if (fullLabel.length > 3) deferred.push({ title: t('bookletNotes'), body: card.title });
        const headingHeight = Math.max(labelLines.length * 10, qrSize ? qrSize + 2 : 0);
        page.elements.push(...labelLines.map((line, j) => text(x + 4, y + 10 + j * 10, line, 7.2, true)));
        if (card.qrSvg) {
          page.elements.push(fitBookletCourt(card.qrSvg, x + cw - qrSize - 2, y + 2, qrSize, qrSize, `p${pages.length}c${i}qr`));
        }
        if (card.court) {
          const sideText = columns === 1 && card.body;
          const svgWidth = sideText ? Math.min(a4 ? 210 : 150, cw * .42) : cw;
          const sample = sideText ? '' : card.body ?? card.court.sample ?? '';
          // Long samples/notes continue on their own page rather than shrinking the SVG.
          const sampleLines = wrapBookletText(sample, cw - 8, 6);
          const maxLines = card.descriptionBelow ? Math.min(card.descriptionLineLimit ?? Infinity, Math.max(3, Math.floor((ch - headingHeight - 80) / 8))) : 3;
          const visibleSample = sampleLines.length <= maxLines ? sampleLines : card.descriptionBelow ? [...sampleLines.slice(0, maxLines - 1), '…'] : [];
          if (sample && sampleLines.length > maxLines) deferred.push({ title: card.title, body: sample });
          const availableHeight = Math.max(20, ch - headingHeight - visibleSample.length * 8 - 10);
          const vb = card.court.svg.match(/viewBox=["']([^"']+)["']/)?.[1].split(/[ ,]+/).map(Number);
          const aspect = Math.max(1, vb?.[2] ?? 240) / (vb?.[3] ?? 254);
          // A note sits in a box beside the court, which keeps its size unless the free space is too narrow.
          const minBox = a4 ? 100 : 72;
          const courtWidth = card.note && card.descriptionBelow ? Math.min(cw - minBox - 6, availableHeight * aspect) : svgWidth;
          const drawingHeight = card.descriptionBelow ? Math.min(availableHeight, courtWidth / aspect) : availableHeight;
          // The text under the court stays level with the cards beside it, which have no note.
          const rowHeight = card.descriptionBelow ? Math.min(availableHeight, svgWidth / aspect) : availableHeight;
          page.elements.push(fitBookletCourt(card.court.svg, x, y + headingHeight + 4, courtWidth, drawingHeight, `p${pages.length}c${i}`));
          if (card.note && card.descriptionBelow) {
            const boxX = x + courtWidth + 6, boxY = y + headingHeight + 4, boxWidth = cw - courtWidth - 6, boxHeight = Math.max(drawingHeight, rowHeight);
            const size = a4 ? 7 : 6, step = size * 1.35;
            const noteLines = wrapBookletText(card.note.body, boxWidth - 8, size);
            const capacity = Math.max(1, Math.floor((boxHeight - 6) / step));
            const fits = noteLines.length <= capacity;
            // A longer note shows its start and continues, whole, in the staff notes.
            const shown = fits ? noteLines : [...noteLines.slice(0, capacity - 1), '…'];
            if (fits) notesInBox.add(card.note.id);
            page.elements.push(`<rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="3" fill="#f8fafc" stroke="#cbd5e1" stroke-width=".6" data-court-note="${xml(card.note.id)}"/>`);
            page.elements.push(...shown.map((line, j) => text(boxX + 4, boxY + 4 + size + j * step, line, size)));
          }
          const sampleY = card.descriptionBelow ? y + headingHeight + Math.max(drawingHeight, rowHeight) + 12 : y + ch - visibleSample.length * 8;
          visibleSample.forEach((line, j) => page.elements.push(text(x + 4, sampleY + j * 8, line, 6)));
          if (sideText) {
            const bodyLines = wrapBookletText(card.body!, cw - svgWidth - 15, 8);
            if (bodyLines.length * 11.2 > ch - headingHeight - 12) deferred.push({ title: card.title, body: card.body! });
            else page.elements.push(...lines(x + svgWidth + 10, y + headingHeight + 18, card.body!, cw - svgWidth - 15));
          }
        } else if (card.body) deferred.push({ title: card.title, body: card.body });
      });
    }
  };
  const rememberNotes = (piece?: ResolvedBoardPiece) => {
    if (piece?.note.trim()) deferred.push({ id: `${piece.id}:note`, title: piece.title, body: piece.note, inBox: notesInBox.has(`${piece.id}:note`) });
    if (piece && report.pieceEdits?.[piece.id]?.subtitle !== undefined && piece.subtitle) deferred.push({ id: `${piece.id}:subtitle`, title: piece.title, body: piece.subtitle });
    if (piece && report.pieceEdits?.[piece.id]?.table && piece.table) deferred.push({ id: `${piece.id}:table`, title: piece.title,
      body: [piece.table.columns.join(' | '), ...piece.table.rows.map(row => row.map(formatViewCell).join(' | '))].join('\n') });
  };
  const resolvedBoardPieces = resolveBoardPieces(report, view, t);
  const hasBoardSelection = Array.isArray(report.boardPieceIds);
  const boardPieceIdSet = new Set(resolvedBoardPieces.map((p) => p.id));
  const showKeys = !hasBoardSelection || resolvedBoardPieces.some((p) => p.sheetId === 'keys');
  const showServeTargets = !hasBoardSelection || resolvedBoardPieces.some((p) => p.sheetId === 'serveTargets');
  const showSetter = !hasBoardSelection || resolvedBoardPieces.some((p) => p.sheetId === 'setter');

  const keys = catalog.get(PIECE_KEYS_MAIN);
  const legacyItems = report.pieceEdits?.[PIECE_KEYS_MAIN]?.items;
  const printable = legacyItems ? legacyItems.slice(0, 5).map((body, index) => ({ body, index })) : view.keys.slice(0, 5).flatMap((key, index) => index < 3 || key.includeInPrint !== false ? [{ body: key.text + (key.sample !== undefined ? ` (${key.sampleText ?? t('opponentReportKeySample', { n: key.sample })})` : ''), index }] : []);
  // Reaction after a conceded break: a short block under the priorities in every layout.
  const breakReaction = catalog.get(PIECE_OVERVIEW_BREAK_REACTION);
  const breakTable = breakReaction?.table ?? view.overview.breakReaction;
  const breakLines = breakTable.rows
    .filter((row) => row[1] && formatViewCell(row[1]) !== '-')
    .map((row) => `${formatViewCell(row[0])}: ${formatViewCell(row[1])}${row[2] ? ` (${formatViewCell(row[2])})` : ''}`);
  // Team indicators: one compact line per phase, under the priorities.
  const indicatorRows = view.overview.teamIndicators.rows.filter((row) => formatViewCell(row[1]) !== '-');
  const indicatorBody = [indicatorRows.slice(0, 4), indicatorRows.slice(4)]
    .map((group) => group.map((row) => `${formatViewCell(row[0])} ${formatViewCell(row[1])}`).join(' · '))
    .filter(Boolean).join('\n');
  // "Team": the athletes who played, then the sets started in each rotation as two bar charts.
  const teamRoster = resolvedBoardPieces.find((p) => p.id === PIECE_TEAM_ROSTER);
  const teamStarts = resolvedBoardPieces.find((p) => p.id === PIECE_TEAM_STARTS);
  if (teamRoster?.table || teamStarts?.table) {
    component = 'team';
    const page = add(t('teamPageTitle', { team: report.opponent.name }));
    const chartBlock = teamStarts?.table ? (a4 ? 190 : 150) : 0;
    let y = TOP;
    if (teamRoster?.table) {
      page.elements.push(text(M, y + 10, teamRoster.title, 10, true));
      y += 18;
      const headers = teamRoster.table.columns;
      y += 9;
      const size = a4 ? 9 : 8, step = size * 1.45;
      const rows = teamRoster.table.rows.map((row) => row.map(formatViewCell));
      const perColumn = Math.max(1, Math.floor((BOTTOM - chartBlock - y - 6) / step));
      const columns = rows.length > perColumn ? 2 : 1;
      const columnWidth = columns === 2 ? (WIDTH - 12) / 2 : WIDTH;
      const shown = rows.slice(0, perColumn * columns);
      shown.forEach((row, i) => {
        const x = M + Math.floor(i / perColumn) * (columnWidth + 12), rowY = y + (i % perColumn) * step + size;
        page.elements.push(text(x, rowY, row[0] ?? '', size, true));
        const nameX = x + size * 2.6, nameWidth = Math.min(columnWidth * 0.5, size * 20) - size * 2.6;
        const roleX = nameX + nameWidth + 6, roleWidth = Math.min(size * 11, columnWidth - (roleX - x) - size * 3);
        page.elements.push(text(nameX, rowY, wrapBookletText(row[1] ?? '', nameWidth, size)[0] ?? '', size));
        page.elements.push(text(roleX, rowY, wrapBookletText(row[2] ?? '', roleWidth, size)[0] ?? '', size, false, '#475569'));
        const matchesX = roleX + roleWidth + size * 4;
        if (i % perColumn === 0) {
          // Column headings above each column of athletes.
          const headingY = y - 3;
          [[x, headers[0]], [nameX, headers[1]], [roleX, headers[2]]].forEach(([left, label]) => { if (label) page.elements.push(text(left as number, headingY, label as string, 6.5, true, '#475569')); });
          if (headers[3]) page.elements.push(`<text x="${matchesX}" y="${headingY}" font-size="6.5" font-weight="bold" fill="#475569" text-anchor="end">${xml(headers[3])}</text>`);
        }
        if (row[3]) page.elements.push(`<text x="${matchesX}" y="${rowY}" font-size="${size}" fill="${color}" text-anchor="end">${xml(row[3])}</text>`);
      });
      if (rows.length > shown.length) deferred.push({ title: teamRoster.title, body: rows.slice(shown.length).map((row) => row.filter(Boolean).join(' ')).join('\n') });
      rememberNotes(teamRoster);
    }
    if (teamStarts?.table) {
      const top = BOTTOM - chartBlock + 8;
      page.elements.push(text(M, top, teamStarts.title, 10, true));
      page.elements.push(teamStartsElements(M, top + 8, WIDTH, BOTTOM - top - 8, teamStarts, view.team, report.pieceEdits?.[PIECE_TEAM_STARTS]?.chartColors, t));
      rememberNotes(teamStarts);
    }
    component = 'keys';
  }
  if (showKeys) {
    prose(keys?.title ?? t('opponentReportSheet_keys'), [
      ...(printable.length ? printable.map(({ body, index }) => ({ body, primary: index < 3, label: `${index + 1}. ${t(index < 3 ? 'priorityPrimary' : 'prioritySecondary')}` })) : [{ body: t('opponentReportKeysNoProposals') }]),
      ...(breakLines.length ? [{ body: breakLines.join('\n'), label: breakReaction?.title ?? t('opponentReportBreakReaction') }] : []),
      ...(indicatorBody ? [{ body: indicatorBody, label: t('opponentReportTeamIndicators') }] : []),
    ]);
    rememberNotes(keys);
    if (breakLines.length) rememberNotes(breakReaction);
  }
  component = 'serveTargets';
  const reception = catalog.get(PIECE_RECEPTION_SERVE_TARGETS);
  if (showServeTargets) {
    const serveTargetDrawings = (reception?.courts ?? []).map((court) => court.drawing);
    const serveTargetsHasMove = serveTargetDrawings.some((drawing) => drawingHasMoveArrows(drawing));
    const serveTargetsLegendSvg = buildServeTargetsLegendSvg(
      {
        good: t('serveTargetLegendGood'),
        mid: t('serveTargetLegendMid'),
        weak: t('serveTargetLegendWeak'),
        none: t('serveTargetLegendNone'),
        setter: t('serveTargetLegendSetter'),
        target: t('serveTargetLegendTarget'),
        zone: t('serveTargetLegendZone'),
        move: t('serveTargetLegendMove'),
        courtNote: t('serveTargetLegendCourt'),
      },
      serveTargetsHasMove,
      {
        moveColor: findMoveArrowColor(serveTargetDrawings),
        customEntries: collectCustomLegendEntries(serveTargetDrawings),
      },
    );
    const serveTargetPageStart = pages.length;
    grids(reception?.title ?? t('opponentReportFormations'), (reception?.courts ?? []).map((court) => ({ title: court.label, court, body: court.sample, descriptionBelow: true })), 3, 2, BOTTOM - 52, '');
    if (pages.length > serveTargetPageStart) {
      pages[pages.length - 1].elements.push(fitBookletCourt(serveTargetsLegendSvg, M, BOTTOM - 46, WIDTH, 46, 'serve-legend'));
    }
    rememberNotes(reception);
  }
  component = 'attackers';
  const isAttackerPieceId = (id: string) => id.startsWith('attacker:') || Boolean(report.pieceCopies?.[id]?.startsWith('attacker:'));
  const boardAttackers = resolvedBoardPieces.filter((p) => isAttackerPieceId(p.id));
  const seenAttackerIds = new Set(boardAttackers.map((p) => p.id));
  const defaultAttackerPieces = view.attackerViews?.length
    ? view.attackerViews.flatMap((customView) =>
      customView.attackers
        .map((a) => catalog.get(attackerPieceId(a.player.key, customView.id)))
        .filter((p): p is ResolvedBoardPiece => Boolean(p)),
    )
    : view.attackers
      .map((a) => catalog.get(attackerPieceId(a.player.key)))
      .filter((p): p is ResolvedBoardPiece => Boolean(p));
  const attackers = hasBoardSelection
    ? boardAttackers
    : [
      ...boardAttackers,
      ...defaultAttackerPieces.filter((p) => !seenAttackerIds.has(p.id)),
    ];
  const textOnlyAttackers = new Set(settings.textOnlyAttackerKeys ?? []);
  // An attacker with no scouted directions would print an empty court: describe her in text instead.
  const withoutDirections = new Set<string>([
    ...view.attackers.filter((a) => a.hasDirections === false).map((a) => attackerPieceId(a.player.key)),
    ...(view.attackerViews ?? []).flatMap((customView) =>
      customView.attackers.filter((a) => a.hasDirections === false).map((a) => attackerPieceId(a.player.key, customView.id)),
    ),
  ]);
  const isTextOnly = (piece: ResolvedBoardPiece) => {
    const baseId = report.pieceCopies?.[piece.id] ?? piece.id;
    return textOnlyAttackers.has(attackerPlayerKeyFromPieceId(baseId)) || withoutDirections.has(baseId);
  };
  const drawnAttackers = attackers.filter(piece => !isTextOnly(piece));
  const showAttackers = hasBoardSelection
    ? settings.includeAttackers !== false && attackers.length > 0
    : settings.includeAttackers !== false;
  if (showAttackers && (drawnAttackers.length || !attackers.length)) {
    const attackerDrawings = drawnAttackers.map((p) => p.court?.drawing);
    const attackLegendSvg = buildAttackDefenseLegendSvg(
      {
        primary: t('attackDefenseLegendPrimary'),
        other: t('attackDefenseLegendOther'),
        scoring: t('attackDefenseLegendScoring'),
        move: t('serveTargetLegendMove'),
        courtNote: t('attackDefenseLegendCourt'),
      },
      {
        drawings: attackerDrawings,
        customEntries: collectCustomLegendEntries(attackerDrawings),
      },
    );
    const attackPageStart = pages.length;
    const toGridCard = (p: ResolvedBoardPiece) => ({
      title: p.title,
      court: p.court,
      body: [p.subtitle, p.court?.sample].filter(Boolean).join('\n'),
      descriptionBelow: true,
      descriptionLineLimit: a4 ? 5 : 3,
      qrSvg: p.videoLink ? buildQrSvg(p.videoLink.url) ?? undefined : undefined,
      note: (() => {
        const id = `${p.id}:note`;
        const body = (report.staffNoteEdits?.[id] ?? p.note).trim();
        return body ? { id, body } : undefined;
      })(),
    });
    if (view.attackerViews?.length) {
      for (const customView of view.attackerViews) {
        const viewPieces = drawnAttackers.filter((p) => {
          const baseId = report.pieceCopies?.[p.id] ?? p.id;
          return attackerViewIdFromPieceId(baseId) === customView.id;
        });
        if (viewPieces.length === 0) continue;
        grids(`${t('opponentReportSheet_attackers')} · ${customView.label}`, viewPieces.map(toGridCard), 2, 3, BOTTOM - 46);
      }
      const ungrouped = drawnAttackers.filter((p) => {
        const baseId = report.pieceCopies?.[p.id] ?? p.id;
        return !attackerViewIdFromPieceId(baseId);
      });
      if (ungrouped.length > 0) {
        grids(t('opponentReportSheet_attackers'), ungrouped.map(toGridCard), 2, 3, BOTTOM - 46);
      }
    } else {
      grids(t('opponentReportSheet_attackers'), drawnAttackers.map(toGridCard), 2, 3, BOTTOM - 46);
    }
    if (pages.length > attackPageStart) {
      pages[pages.length - 1].elements.push(fitBookletCourt(attackLegendSvg, M, BOTTOM - 40, WIDTH, 40, 'attack-legend'));
    }
  }
  // One block per attacker: name as heading, then "situation: value" lines,
  // rows with no data left out, the sample once at the end.
  const seenTextOnlyPlayers = new Set<string>();
  const descriptions = attackers.filter(isTextOnly).flatMap((piece) => {
    const baseId = report.pieceCopies?.[piece.id] ?? piece.id;
    const playerKey = attackerPlayerKeyFromPieceId(baseId);
    if (seenTextOnlyPlayers.has(playerKey)) return [];
    const attacker = view.attackers.find((entry) => entry.player.key === playerKey);
    if (!attacker) return [];
    seenTextOnlyPlayers.add(playerKey);
    const filled = (cell: unknown) => { if (!cell) return ''; const text = formatViewCell(cell as never); return text && text !== '-' ? text : ''; };
    const lines = (table: typeof attacker.distribution, dropLast: boolean) => table.rows
      .map(row => {
        const values = (dropLast ? row.slice(1, -1) : row.slice(1)).map(filled).filter(Boolean);
        return values.length ? `${formatViewCell(row[0])}: ${values.join(' · ')}` : '';
      })
      .filter(Boolean);
    const body = [
      piece.subtitle,
      ...(piece.table ? lines(piece.table, piece.table.columns.length > 2) : []),
      // Category, value, count (matches dropped): "Zone 3: 2".
      ...attacker.distribution.rows
        .map((row) => {
          const value = filled(row[1]);
          const count = filled(row[2]);
          return value && row[0] ? `${formatViewCell(row[0])} ${value}${count ? `: ${count}` : ''}` : '';
        })
        .filter(Boolean),
      // The court sample counts drawn directions, absent here by definition.
    ].filter(Boolean).join('\n');
    return [{ label: piece.title, body }];
  });
  if (showAttackers && descriptions.length) prose(t('bookletAttackTextOnly'), descriptions);
  if (showAttackers) attackers.forEach(rememberNotes);
  component = 'setter';
  const setters = rankSetterGroups(view.setter.groups);
  const chartedKeys = new Set(chartedSetterKeys(settings, setters));
  const charted = setters.filter((setter) => chartedKeys.has(setter.player.key));
  const textSetters = setters.filter((setter) => !chartedKeys.has(setter.player.key));
  const setterCards = (group: SetterGroup | undefined) => {
    const orderedBands = report.setterViews?.length
      ? (group?.bands ?? [])
      : (group?.bands ?? []).slice().sort((a, b) => Number(a.key === 'negative') - Number(b.key === 'negative'));
    const activeBands = hasBoardSelection && group
      ? orderedBands.filter((band) => boardPieceIdSet.has(setterPieceId(group.player.key, band.key)))
      : orderedBands;
    return activeBands.flatMap((band) => {
      const p = catalog.get(setterPieceId(group!.player.key, band.key));
      rememberNotes(p);
      return (p?.courts ?? []).map((court, idx) => ({ title: report.pieceEdits?.[p?.id ?? '']?.title ? `${p?.title} · ${court.label}` : court.label, court, body: [court.sample, report.pieceEdits?.[p?.id ?? '']?.courtBadges?.[court.key]].filter(Boolean).join('\n'), bandKey: band.key, qrSvg: idx === 0 && p?.videoLink ? buildQrSvg(p.videoLink.url) ?? undefined : undefined }));
    });
  };
  const setterGrid = (group: SetterGroup | undefined, bottom = BOTTOM) => {
    const cards = setterCards(group);
    if (hasBoardSelection && cards.length === 0) return;
    const customLegend = collectCustomLegendEntries(cards.map((c) => c.court?.drawing));
    const pageStart = pages.length;
    const bandHeadings: Record<string, string> = report.setterViews?.length
      ? {
          positive: t('opponentReportSetterPositiveBand'),
          negative: t('opponentReportSetterNegativeBand'),
          ...Object.fromEntries((group?.bands ?? []).map((band) => [band.key, band.title])),
        }
      : {
          ...Object.fromEntries((group?.bands ?? []).map((band) => [band.key, band.title])),
          positive: t('opponentReportSetterPositiveBand'),
          negative: t('opponentReportSetterNegativeBand'),
        };
    grids(
      `${t('opponentReportSheet_setter')}${group ? ' · ' + playerLabel(group.player) : ''}`,
      cards, 3, 4, customLegend.length ? bottom - 32 : bottom, t('bookletSetterLegend'), bandHeadings,
    );
    if (customLegend.length && pages.length > pageStart) {
      pages[pages.length - 1].elements.push(
        fitBookletCourt(buildCustomLegendSvg(customLegend), M, bottom - 28, WIDTH, 28, 'setter-legend'),
      );
    }
  };
  if (showSetter) {
    const firstPage = pages.length;
    if (charted[0]) setterGrid(charted[0], compact && textSetters.length > 0 ? BOTTOM - 86 : BOTTOM);
    else if (!setters.length) setterGrid(undefined);
    const drewFirst = pages.length > firstPage;
    textSetters.forEach(setter => setter.bands.forEach(band => rememberNotes(catalog.get(setterPieceId(setter.player.key, band.key)))));
    const summaries = textSetters.map(setter => ({body: t('bookletSetterSummarySentence', {
      player: playerLabel(setter.player),
      positive: setter.bands.find(band => band.key === 'positive')?.summary || t('bookletMissing'),
      negative: setter.bands.find(band => band.key === 'negative')?.summary || t('bookletMissing'),
    })}));
    if (summaries.length) {
      // Compact summaries are placed in the lower band of the last setting page when short enough.
      // Native setting diagrams need their full grid: keep long summaries on a readable continuation.
      if (compact && drewFirst) {
        const summaryText = report.staffNoteEdits?.['setter-summary'] ?? summaries.map(entry => entry.body).join('\n');
        const summaryLines = wrapBookletText(summaryText, WIDTH - 8, 6.4);
        if (summaryLines.length <= 8) pages[pages.length - 1].elements.push(...summaryLines.map((line, index) => text(M + 4, BOTTOM - 72 + index * 9, line, 6.4)));
        else deferred.push({ id: 'setter-summary', title: t('bookletSecondSummary'), body: summaryText });
      }
      else deferred.push({ id: 'setter-summary', title: t('bookletSecondSummary'), body: summaries.map(entry => entry.body).join('\n') });
    }
    for (const group of charted.slice(1)) setterGrid(group);
  }
  // Zone analysis: one page per phase, the six rotations as on the setter's page.
  // On the board, or (without a board selection) when the sheet is switched on.
  const zonePieces = resolvedBoardPieces.filter((p) => p.sheetId === 'zones');
  if (zonePieces.length) {
    component = 'zones';
    for (const piece of zonePieces) {
      rememberNotes(piece);
      grids(piece.title, (piece.courts ?? []).map((court) => ({ title: court.label, court, body: court.sample })), 3, 2, BOTTOM, view.zones?.legend ?? '');
    }
  }
  // "How they serve": the six main servers with serve directions on one page; the others
  // as text or an optional sheet. Without any scouted direction the sheet is left out.
  const servePiece = (s: ReportView['serve']['servers'][number]) => catalog.get(servePieceId(s.player.key));
  const servers = settings.includeServe
    ? view.serve.servers.map(servePiece).filter((p): p is ResolvedBoardPiece => Boolean(p))
    : [];
  const serveText = new Map(view.serve.servers.map((s) => [servePieceId(s.player.key), s.textSummary]));
  const drawable = new Set(view.serve.servers.filter((s) => s.hasDirections).map((s) => servePieceId(s.player.key)));
  if (settings.includeServe && drawable.size) {
    component = 'serve';
    const serveCard = (p: ResolvedBoardPiece) => ({ title: p.title, court: p.court, body: [p.subtitle, p.court?.sample].filter(Boolean).join('\n'), descriptionBelow: true, descriptionLineLimit: 2, qrSvg: p.videoLink ? buildQrSvg(p.videoLink.url) ?? undefined : undefined });
    const withDirections = servers.filter((p) => drawable.has(p.id));
    const starters = withDirections.slice(0, 6), reserves = withDirections.slice(6);
    const textOnly = servers.filter((p) => !drawable.has(p.id));
    const serveDrawings = withDirections.map((p) => p.court?.drawing);
    const serveHowLegendSvg = buildServeHowLegendSvg(
      {
        heat: t('serveHowLegendHeat'),
        routes: t('serveHowLegendRoutes'),
        ace: t('serveHowLegendAce'),
        move: t('serveTargetLegendMove'),
      },
      {
        drawings: serveDrawings,
        customEntries: collectCustomLegendEntries(serveDrawings),
      },
    );
    const servePageStart = pages.length;
    grids(t('opponentReportSheet_serve'), starters.map(serveCard), 2, 3, BOTTOM - 38);
    if (reserves.length && settings.includeServeReserves) grids(`${t('opponentReportSheet_serve')} · ${t('serveHowReserves')}`, reserves.map(serveCard), 2, 3, BOTTOM - 38);
    if (pages.length > servePageStart) {
      pages[pages.length - 1].elements.push(fitBookletCourt(serveHowLegendSvg, M, BOTTOM - 32, WIDTH, 32, 'serve-how-legend'));
    }
    const listed = [...(settings.includeServeReserves ? [] : reserves), ...textOnly];
    if (listed.length) deferred.push({ id: 'serve-reserves', title: t('serveHowReserves'), body: listed.map((p) => serveText.get(p.id) ?? p.title).join('\n') });
    servers.forEach(rememberNotes);
  } else if (settings.includeServe && servers.length) {
    // No scouted directions: no court sheet, only what is known about each server.
    deferred.push({ id: 'serve-text', title: t('opponentReportSheet_serve'), body: servers.map((p) => serveText.get(p.id) ?? p.title).join('\n') });
  }
  if (custom && settings.includeBoardExtras) {
    const included = new Set([...zonePieces.map((p) => p.id), PIECE_TEAM_ROSTER, PIECE_TEAM_STARTS, PIECE_KEYS_MAIN, PIECE_OVERVIEW_BREAK_REACTION, PIECE_RECEPTION_SERVE_TARGETS, ...attackers.map(p => p.id), ...setters.flatMap(s => s.bands.map(b => setterPieceId(s.player.key,b.key))),
      ...(drawable.size ? servers.map(p => p.id) : [])]);
    const extraPieces = resolveBoardPieces(report, view, t).filter((p) => !included.has(p.id));
    const extraCards: Card[] = [];
    const extraParagraphs: Array<{ label?: string; body: string }> = [];
    for (const piece of extraPieces) {
      component = piece.sheetId;
      const courts = piece.courts ?? (piece.court ? [piece.court] : []);
      if (courts.length) {
        courts.forEach((court) => {
          extraCards.push({
            title: piece.title === court.label ? piece.title : `${piece.title} · ${court.label}`,
            court,
            body: [piece.subtitle, court.sample].filter(Boolean).join('\n'),
            descriptionBelow: true,
            descriptionLineLimit: a4 ? 5 : 3,
          });
        });
        const extraLines = [...(piece.items ?? []), ...(piece.secondaryItems ?? []), ...(!a4 && piece.table ? [piece.table.columns.join(' | '), ...piece.table.rows.map(row => row.map(formatViewCell).join(' | '))] : []), piece.note].filter(Boolean).join('\n');
        if (extraLines) extraParagraphs.push({ label: piece.title, body: extraLines });
      } else {
        const body = [piece.subtitle, ...(piece.items ?? []), ...(piece.secondaryItems ?? []), ...(!a4 && piece.table ? [piece.table.columns.join(' | '), ...piece.table.rows.map(row => row.map(formatViewCell).join(' | '))] : []), piece.note].filter(Boolean).join('\n');
        if (body) extraParagraphs.push({ label: piece.title, body });
      }
    }
    if (extraCards.length) {
      const extraCustomLegend = collectCustomLegendEntries(extraCards.map((c) => c.court?.drawing));
      grids(
        extraPieces.find((p) => (p.courts?.length || p.court))?.title ?? t('bookletNotes'),
        extraCards,
        2,
        3,
        extraCustomLegend.length ? BOTTOM - 32 : BOTTOM,
      );
      if (extraCustomLegend.length) {
        pages[pages.length - 1].elements.push(
          fitBookletCourt(buildCustomLegendSvg(extraCustomLegend), M, BOTTOM - 28, WIDTH, 28, 'extra-legend'),
        );
      }
    }
    if (extraParagraphs.length) {
      prose(extraParagraphs[0].label ?? t('bookletNotes'), extraParagraphs);
    }
  }
  if (a4) {
    // Keep the full report's statistical detail alongside the mandatory booklet diagrams.
    const detailed = new Map(resolveBoardPieces(report, view, t).map(piece => [piece.id, piece]));
    if (!showAttackers) for (const piece of attackers) detailed.delete(piece.id);
    if (breakLines.length) detailed.delete(PIECE_OVERVIEW_BREAK_REACTION);
    // Already drawn on the "Team" page.
    detailed.delete(PIECE_TEAM_ROSTER);
    detailed.delete(PIECE_TEAM_STARTS);
    for (const piece of [
      ...(showServeTargets ? [reception] : []),
      ...(showAttackers ? attackers : []),
      ...(showSetter ? charted.flatMap((group) => group.bands.filter((b) => !hasBoardSelection || boardPieceIdSet.has(setterPieceId(group.player.key, b.key))).map(b => catalog.get(setterPieceId(group.player.key, b.key)))) : []),
    ]) {
      if (piece) detailed.set(piece.id, piece);
    }
    let detailPage: Page | undefined, detailY = TOP;
    for (const piece of detailed.values()) {
      if (report.pieceCopies?.[piece.id]) continue;
      component = piece.sheetId;
      if (piece.table?.columns.length && (piece.kind !== 'player-card' || drawnAttackers.some(a => a.id === piece.id) || !attackers.some(a => a.id === piece.id) && !(settings.includeServe && drawable.size && piece.sheetId === 'serve'))) {
        const table = piece.table;
        const estimatedHeight = 24 + (1 + table.rows.length) * 32;
        const fitsSinglePage = estimatedHeight <= BOTTOM - TOP;
        const needsBreak = !detailPage || detailPage.component !== component || detailY + (fitsSinglePage ? estimatedHeight : 80) > BOTTOM;
        if (needsBreak) { detailPage = add(t(`opponentReportSheet_${piece.sheetId}`)); detailY = TOP; }
        let page = detailPage!, y = detailY;
        page.elements.push(text(M, y + 12, piece.title, 10, true)); y += 24;
        const cellWidth = WIDTH / table.columns.length;
        const drawRow = (cells: string[], header: boolean) => {
          const wrapped = cells.map(value => wrapBookletText(value, cellWidth - 12, 8));
          const totalLines = Math.max(1, ...wrapped.map(value => value.length));
          const chunkLines = Math.floor((BOTTOM - TOP - 60) / 12);
          for (let offset = 0; offset < totalLines; offset += chunkLines) {
          const chunk = wrapped.map(value => value.slice(offset, offset + chunkLines));
          const height = Math.max(26, Math.max(...chunk.map(value => value.length)) * 12 + 12);
          if (y + height > BOTTOM) { page = add(t(`opponentReportSheet_${piece.sheetId}`)); y = TOP; if (!header) drawRow(table.columns, true); }
          page.elements.push(`<rect x="${M}" y="${y}" width="${WIDTH}" height="${height}" fill="${header ? '#eaf3f3' : '#f8fafc'}"/>`);
          chunk.forEach((value, col) => value.forEach((line, row) => page.elements.push(text(M + col * cellWidth + 6, y + 16 + row * 12, line, 8, header))));
          y += height + 2;
          }
        };
        drawRow(table.columns, true);
        table.rows.forEach(row => drawRow(row.map(formatViewCell), false));
        detailPage = page; detailY = y + 20;
      }
      const body = [piece.subtitle, ...(piece.id === PIECE_KEYS_MAIN ? [] : piece.items ?? []), ...(piece.secondaryItems ?? [])].filter(Boolean).join('\n');
      if (body) deferred.push({ id: `${piece.id}:details`, title: piece.title, body });
    }
    if (options.matchLines?.length) deferred.push({ id: 'sources', title: t('opponentReportPdfMatches'), body: options.matchLines.join('\n') });
  }
  if (report.notes.trim()) deferred.push({ id: 'manual', title: t('bookletNotes'), body: report.notes });
  const context = [opponentReportTitle(report), sampleLine].filter(Boolean).join(' · ');
  if (wrapBookletText(context, WIDTH, 6).length > 1) deferred.unshift({ title: t('bookletNotes'), body: context });
  // Preserve long headings in a continuation rather than losing their trailing text.
  for (const page of pages) if (wrapBookletText(page.title, WIDTH, 13).length > 2) deferred.push({ title: t('bookletNotes'), body: page.title });
  // Coalesce identical sheet-level notes repeated by several cards/bands.
  const seen = new Set<string>();
  const staffNotes: ReportStaffNote[] = [];
  const annotations: Array<{ body: string }> = [];
  for (const entry of deferred) {
    const fingerprint = entry.title + '\u0000' + entry.body + (entry.inBox ? '\u0001' : '');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    // Source-based ids keep coach edits stable across layout and language changes.
    const id = entry.id ?? `continuation:${fingerprint}`;
    const body = entry.id === 'manual' ? entry.body : report.staffNoteEdits?.[id] ?? entry.body;
    if (entry.id !== 'manual') staffNotes.push({ id, title: entry.title, body });
    if (body.trim() && !entry.inBox) annotations.push({ body: `${entry.title}\n${body}` });
  }
  component = 'notes';
  // Paper has no links: one QR code per chart with synced YouTube video.
  const videoPieces = [...catalog.values()].filter((piece) => piece.videoLink
    && (showAttackers || piece.sheetId !== 'attackers')
    && (settings.includeServe !== false || piece.sheetId !== 'serve'));
  const qrColumns = a4 ? 4 : 3, qrSize = a4 ? 96 : 88, qrCell = WIDTH / qrColumns, qrRowHeight = qrSize + 52;
  let qrPage: Page | undefined, qrY = TOP;
  const qrExpiry = videoPieces.length ? new Date(Math.min(...videoPieces.map((piece) => piece.videoLink!.expiresAt))).toLocaleDateString() : '';
  const qrHelp = `${t('bookletVideoHelp')} ${t('opponentReportVideoLink', { date: qrExpiry })}`;
  // The grid position follows the printed cells only: a chart whose link is too long for a QR code
  // still gets its cell (caption and a note), so rows never overlap and cells are never left empty.
  videoPieces.forEach((piece, index) => {
    const link = piece.videoLink!;
    const qr = buildQrSvg(link.url);
    const column = index % qrColumns;
    if (!qrPage || column === 0 && qrY + qrRowHeight > BOTTOM) { qrPage = add(t('bookletVideoTitle')); const help = lines(M, TOP + 6, qrHelp, WIDTH, 6.5); qrPage.elements.push(...help); qrY = TOP + 8 + help.length * 9; }
    const x = M + column * qrCell;
    if (qr) qrPage.elements.push(fitBookletCourt(qr, x, qrY, qrSize, qrSize, `qr${index}`));
    const caption = [piece.title, qr ? t(videoLinkWatchKey(link)) : t('opponentReportVideoQrUnavailable'), t('tacticalVideoCoverage', { available: link.actions ?? link.clips, total: link.totalActions ?? link.clips })];
    caption.flatMap((line) => wrapBookletText(line, qrCell - 8, 6.5)).slice(0, 4)
      .forEach((line, j) => qrPage!.elements.push(text(x, qrY + (qr ? qrSize : 0) + 9 + j * 8.5, line, 6.5, j === 0)));
    if (column === qrColumns - 1) qrY += qrRowHeight;
  });
  if (annotations.length) prose(t('bookletNotes'), annotations);
  const order = reportComponentOrder(report);
  pages.sort((a,b) => order.indexOf(a.component) - order.indexOf(b.component));
  const contentPages = pages.length;
  const minimum = compact || custom ? 4 : 8;
  const target = a4 ? contentPages : Math.ceil(Math.max(minimum, contentPages) / 4) * 4;
  while (pages.length < target) {
    const page = add(t('bookletNotes'));
    for (let y = TOP + 20; y < BOTTOM; y += 26) page.elements.push(`<line x1="${M}" y1="${y}" x2="${pageWidth - M}" y2="${y}" stroke="#cbd5e1" stroke-width="0.5"/>`);
  }
  const footer = `${APP_METADATA.name} · ${APP_METADATA.author.displayName} · ${APP_METADATA.urls.webApp} · ${t('bookletFreeSoftware')} · GNU AGPL v3 or later (${APP_METADATA.license})`;
  const footerSize = Math.min(4.5, WIDTH / Math.max(1, [...footer].length * .64));
  const attribution = t('tacticalAttributionFooter');
  // Two lines at a readable size instead of one squeezed line.
  const attributionSize = 3.8;
  const attributionLines = wrapBookletText(attribution, WIDTH, attributionSize).slice(0, 2);
  return {
    pages: pages.map((page, i) => `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}"><rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="65" fill="${color}"/>${text(M, 18, report.opponent.name, 8, true, '#fff')}${wrapBookletText(page.title, WIDTH, 13).slice(0, 2).map((line, j) => text(M, 36 + j * 15, line, 13, true, '#fff')).join('')}${text(M, 77, wrapBookletText(context, WIDTH, 6)[0] ?? '', 6)}${page.elements.join('')}<line x1="${M}" y1="${pageHeight - 30}" x2="${pageWidth - M}" y2="${pageHeight - 30}" stroke="#cbd5e1"/>${text(M, pageHeight - 24, footer, footerSize)}${attributionLines.map((line, j) => text(M, pageHeight - 18 + j * 4.6, line, attributionSize)).join('')}${text(M, pageHeight - 4, `${i + 1} / ${pages.length}`, 5)}</svg>`),
    staffNotes,
    width: pageWidth, height: pageHeight,
    contentPages, paddingPages: pages.length - contentPages, sheets: pages.length / 4, format: settings,
  };
}

export function bookletImposition(pageCount: number): Array<[number, number]> {
  if (pageCount < 4 || pageCount % 4 !== 0) throw new Error('Booklets require a multiple of four pages');
  const faces: Array<[number, number]> = [];
  for (let sheet = 0; sheet < pageCount / 4; sheet++) faces.push([pageCount - 1 - sheet * 2, sheet * 2], [sheet * 2 + 1, pageCount - 2 - sheet * 2]);
  return faces;
}

export function imposeBooklet(plan: ReportBookletPlan): string[] {
  const width = 841.89, height = BOOKLET_HEIGHT;
  return bookletImposition(plan.pages.length).map((pair) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${pair.map((index, side) => fitBookletCourt(plan.pages[index], side * width / 2, 0, width / 2, height, `sheet-${index}`)).join('')}</svg>`);
}

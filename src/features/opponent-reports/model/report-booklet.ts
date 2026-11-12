import type { OpponentReport, OpponentReportBooklet, OpponentReportComponentId } from '@src/domain/opponent-report/types';
import { reportComponentOrder } from './report-components';
import { APP_METADATA } from '@src/lib/constants/app';
import { buildBoardPieceCatalog, resolveBoardPieces, PIECE_KEYS_MAIN, PIECE_OVERVIEW_BREAK_REACTION, PIECE_RECEPTION_SERVE_TARGETS, setterPieceId, attackerPieceId, servePieceId, type ResolvedBoardCourt, type ResolvedBoardPiece } from './board-pieces';
import { formatViewCell, type ReportView, type ViewT } from './report-view';
import { playerLabel } from './report-keys';
import { buildQrSvg } from './qr-svg';
import { videoLinkWatchKey } from './attacker-video-links';

export const BOOKLET_WIDTH = 419.528;
export const BOOKLET_HEIGHT = 595.276;
export const DEFAULT_BOOKLET: OpponentReportBooklet = { format: 'extended', base: 'extended', includeServe: true, includeServeReserves: false, includeAttackers: true, includeSecondSetter: false, includeBoardExtras: false };
const M = 20, TOP = 87;
const xml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
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
interface Card { title: string; court?: ResolvedBoardCourt; body?: string; bandKey?: string; descriptionBelow?: boolean; descriptionLineLimit?: number; qrSvg?: string }
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
  const deferred: Array<{ id?: string; title: string; body: string }> = [];
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
        if (bandHeadings && card.bandKey && i % (columns * 2) === 0) page.elements.push(text(M, y - 4, bandHeadings[card.bandKey], 8, true, '#007e80'));
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
          const drawingHeight = card.descriptionBelow ? Math.min(availableHeight, svgWidth * (vb?.[3] ?? 254) / Math.max(1, vb?.[2] ?? 240)) : availableHeight;
          page.elements.push(fitBookletCourt(card.court.svg, x, y + headingHeight + 4, svgWidth, drawingHeight, `p${pages.length}c${i}`));
          const sampleY = card.descriptionBelow ? y + headingHeight + drawingHeight + 12 : y + ch - visibleSample.length * 8;
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
    if (piece?.note.trim()) deferred.push({ id: `${piece.id}:note`, title: piece.title, body: piece.note });
    if (piece && report.pieceEdits?.[piece.id]?.subtitle !== undefined && piece.subtitle) deferred.push({ id: `${piece.id}:subtitle`, title: piece.title, body: piece.subtitle });
    if (piece && report.pieceEdits?.[piece.id]?.table && piece.table) deferred.push({ id: `${piece.id}:table`, title: piece.title,
      body: [piece.table.columns.join(' | '), ...piece.table.rows.map(row => row.map(formatViewCell).join(' | '))].join('\n') });
  };
  const keys = catalog.get(PIECE_KEYS_MAIN);
  const legacyItems = report.pieceEdits?.[PIECE_KEYS_MAIN]?.items;
  const printable = legacyItems ? legacyItems.slice(0, 5).map((body, index) => ({ body, index })) : view.keys.slice(0, 5).flatMap((key, index) => index < 3 || key.includeInPrint !== false ? [{ body: key.text + (key.sample !== undefined ? ` (${t('opponentReportKeySample', { n: key.sample })})` : ''), index }] : []);
  // Reaction after a conceded break: a short block under the priorities in every layout.
  const breakReaction = catalog.get(PIECE_OVERVIEW_BREAK_REACTION);
  const breakTable = breakReaction?.table ?? view.overview.breakReaction;
  const breakLines = breakTable.rows
    .filter((row) => row[1] && formatViewCell(row[1]) !== '–')
    .map((row) => `${formatViewCell(row[0])}: ${formatViewCell(row[1])}${row[2] ? ` (${formatViewCell(row[2])})` : ''}`);
  // Team indicators: one compact line per phase, under the priorities.
  const indicatorRows = view.overview.teamIndicators.rows.filter((row) => formatViewCell(row[1]) !== '–');
  const indicatorBody = [indicatorRows.slice(0, 4), indicatorRows.slice(4)]
    .map((group) => group.map((row) => `${formatViewCell(row[0])} ${formatViewCell(row[1])}`).join(' · '))
    .filter(Boolean).join('\n');
  prose(keys?.title ?? t('opponentReportSheet_keys'), [
    ...(printable.length ? printable.map(({ body, index }) => ({ body, primary: index < 3, label: `${index + 1}. ${t(index < 3 ? 'priorityPrimary' : 'prioritySecondary')}` })) : [{ body: t('opponentReportKeysNoProposals') }]),
    ...(breakLines.length ? [{ body: breakLines.join('\n'), label: breakReaction?.title ?? t('opponentReportBreakReaction') }] : []),
    ...(indicatorBody ? [{ body: indicatorBody, label: t('opponentReportTeamIndicators') }] : []),
  ]);
  rememberNotes(keys);
  if (breakLines.length) rememberNotes(breakReaction);
  component = 'serveTargets';
  const reception = catalog.get(PIECE_RECEPTION_SERVE_TARGETS);
  grids(reception?.title ?? t('opponentReportFormations'), (reception?.courts ?? []).map((court) => ({ title: court.label, court, body: court.sample, descriptionBelow: true })), 3, 2, BOTTOM, reception?.subtitle ?? t('opponentReportServeTargetsHelp'));
  rememberNotes(reception);
  component = 'attackers';
  // Always include attack direction cards; use the catalog so edited drawings/titles survive.
  const attackers = view.attackers.map((a) => catalog.get(attackerPieceId(a.player.key))).filter((p): p is ResolvedBoardPiece => Boolean(p));
  const textOnlyAttackers = new Set(settings.textOnlyAttackerKeys ?? []);
  // An attacker with no scouted directions would print an empty court: describe her in text instead.
  const withoutDirections = new Set(view.attackers.filter((a) => a.hasDirections === false).map((a) => attackerPieceId(a.player.key)));
  const isTextOnly = (piece: ResolvedBoardPiece) => textOnlyAttackers.has(piece.id.slice('attacker:'.length)) || withoutDirections.has(piece.id);
  const drawnAttackers = attackers.filter(piece => !isTextOnly(piece));
  const showAttackers = settings.includeAttackers !== false || Boolean(report.boardPieceIds?.some((id) => id.startsWith('attacker:')));
  if (showAttackers && (drawnAttackers.length || !attackers.length)) grids(t('opponentReportSheet_attackers'), drawnAttackers.map((p) => ({ title: p.title, court: p.court, body: [p.subtitle, p.court?.sample].filter(Boolean).join('\n'), descriptionBelow: true, descriptionLineLimit: a4 ? 5 : 3, qrSvg: p.videoLink ? buildQrSvg(p.videoLink.url) ?? undefined : undefined })), 2, 3);
  const descriptions = attackers.filter(isTextOnly).map(piece => {
    const attacker = view.attackers.find(entry => attackerPieceId(entry.player.key) === piece.id)!;
    const describe = (table: typeof attacker.distribution) => table.rows.map(row => row.map((cell, i) => `${table.columns[i]}: ${formatViewCell(cell)}`).join(' · '));
    return {body: [piece.title, piece.subtitle, piece.court?.sample, ...(piece.table ? describe(piece.table) : []), ...describe(attacker.distribution)].filter(Boolean).join('\n')};
  });
  if (showAttackers && descriptions.length) prose(t('bookletAttackTextOnly'), descriptions);
  if (showAttackers) attackers.forEach(rememberNotes);
  component = 'setter';
  const setters = [...view.setter.groups].sort((a, b) => (b.attempts ?? 0) - (a.attempts ?? 0) || a.player.key.localeCompare(b.player.key));
  const main = setters[0];
  const setterCards = (group: typeof main) => group?.bands.slice().sort((a, b) => Number(a.key === 'negative') - Number(b.key === 'negative')).flatMap((band) => {
    const p = catalog.get(setterPieceId(group.player.key, band.key));
    rememberNotes(p);
    return (p?.courts ?? []).map((court, idx) => ({ title: report.pieceEdits?.[p?.id ?? '']?.title ? `${p?.title} · ${court.label}` : court.label, court, body: [court.sample, report.pieceEdits?.[p?.id ?? '']?.courtBadges?.[court.key]].filter(Boolean).join('\n'), bandKey: band.key, qrSvg: idx === 0 && p?.videoLink ? buildQrSvg(p.videoLink.url) ?? undefined : undefined }));
  }) ?? [];
  const setterGrid = (group: typeof main, bottom = BOTTOM) => grids(
    `${t('opponentReportSheet_setter')}${group ? ' · ' + playerLabel(group.player) : ''}`,
    setterCards(group), 3, 4, bottom, t('bookletSetterLegend'), {
      positive: t('opponentReportSetterPositiveBand'), negative: t('opponentReportSetterNegativeBand'),
    },
  );
  setterGrid(main, compact && setters.length > 1 ? BOTTOM - 86 : BOTTOM);
  setters.slice(1).forEach(setter => setter.bands.forEach(band => rememberNotes(catalog.get(setterPieceId(setter.player.key, band.key)))));
  const summaries = setters.slice(1).map(setter => ({body: t('bookletSetterSummarySentence', {
    player: playerLabel(setter.player),
    positive: setter.bands.find(band => band.key === 'positive')?.summary || t('bookletMissing'),
    negative: setter.bands.find(band => band.key === 'negative')?.summary || t('bookletMissing'),
  })}));
  if (summaries.length) {
    // Compact summaries are placed in the lower band of the last setting page when short enough.
    // Native setting diagrams need their full grid: keep long summaries on a readable continuation.
    if (compact) {
      const summaryText = report.staffNoteEdits?.['setter-summary'] ?? summaries.map(entry => entry.body).join('\n');
      const summaryLines = wrapBookletText(summaryText, WIDTH - 8, 6.4);
      if (summaryLines.length <= 8) pages[pages.length - 1].elements.push(...summaryLines.map((line, index) => text(M + 4, BOTTOM - 72 + index * 9, line, 6.4)));
      else deferred.push({ id: 'setter-summary', title: t('bookletSecondSummary'), body: summaryText });
    }
    else deferred.push({ id: 'setter-summary', title: t('bookletSecondSummary'), body: summaries.map(entry => entry.body).join('\n') });
  }
  if (settings.includeSecondSetter) for (const group of setters.slice(1)) {
    setterGrid(group);
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
    grids(t('opponentReportSheet_serve'), starters.map(serveCard), 2, 3);
    if (reserves.length && settings.includeServeReserves) grids(`${t('opponentReportSheet_serve')} · ${t('serveHowReserves')}`, reserves.map(serveCard), 2, 3);
    const listed = [...(settings.includeServeReserves ? [] : reserves), ...textOnly];
    if (listed.length) deferred.push({ id: 'serve-reserves', title: t('serveHowReserves'), body: listed.map((p) => serveText.get(p.id) ?? p.title).join('\n') });
    servers.forEach(rememberNotes);
  } else if (settings.includeServe && servers.length) {
    // No scouted directions: no court sheet, only what is known about each server.
    deferred.push({ id: 'serve-text', title: t('opponentReportSheet_serve'), body: servers.map((p) => serveText.get(p.id) ?? p.title).join('\n') });
  }
  if (custom && settings.includeBoardExtras) {
    const included = new Set([PIECE_KEYS_MAIN, PIECE_OVERVIEW_BREAK_REACTION, PIECE_RECEPTION_SERVE_TARGETS, ...attackers.map(p => p.id), ...main?.bands.map(b => setterPieceId(main.player.key, b.key)) ?? [],
      ...setters.slice(1).flatMap(s => s.bands.map(b => setterPieceId(s.player.key,b.key))),
      ...(drawable.size ? servers.map(p => p.id) : [])]);
    for (const piece of resolveBoardPieces(report, view, t).filter((p) => !included.has(p.id))) {
      component = piece.sheetId;
      const courts = piece.courts ?? (piece.court ? [piece.court] : []);
      if (courts.length) grids(piece.title, courts.map(court => ({ title: court.label, court, body: court.sample })), 1, 1);
      const body = [piece.subtitle, ...(piece.items ?? []), ...(piece.secondaryItems ?? []), ...(!a4 && piece.table ? [piece.table.columns.join(' | '), ...piece.table.rows.map(row => row.map(formatViewCell).join(' | '))] : []), piece.note].filter(Boolean).join('\n');
      if (body) prose(piece.title, [{ body }]);
    }
  }
  if (a4) {
    // Keep the full report's statistical detail alongside the mandatory booklet diagrams.
    const detailed = new Map(resolveBoardPieces(report, view, t).map(piece => [piece.id, piece]));
    if (!showAttackers) for (const piece of attackers) detailed.delete(piece.id);
    if (breakLines.length) detailed.delete(PIECE_OVERVIEW_BREAK_REACTION);
    for (const piece of [reception, ...(showAttackers ? attackers : []), ...main?.bands.map(b => catalog.get(setterPieceId(main.player.key, b.key))) ?? []]) {
      if (piece) detailed.set(piece.id, piece);
    }
    let detailPage: Page | undefined, detailY = TOP;
    for (const piece of detailed.values()) {
      component = piece.sheetId;
      if (piece.table?.columns.length && (piece.kind !== 'player-card' || drawnAttackers.some(a => a.id === piece.id) || !attackers.some(a => a.id === piece.id) && !(settings.includeServe && drawable.size && piece.sheetId === 'serve'))) {
        const table = piece.table;
        if (!detailPage || detailPage.component !== component || detailY + 80 > BOTTOM) { detailPage = add(t(`opponentReportSheet_${piece.sheetId}`)); detailY = TOP; }
        let page = detailPage, y = detailY;
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
  const context = [report.title, sampleLine].filter(Boolean).join(' · ');
  if (wrapBookletText(context, WIDTH, 6).length > 1) deferred.unshift({ title: t('bookletNotes'), body: context });
  // Preserve long headings in a continuation rather than losing their trailing text.
  for (const page of pages) if (wrapBookletText(page.title, WIDTH, 13).length > 2) deferred.push({ title: t('bookletNotes'), body: page.title });
  // Coalesce identical sheet-level notes repeated by several cards/bands.
  const seen = new Set<string>();
  const staffNotes: ReportStaffNote[] = [];
  const annotations: Array<{ body: string }> = [];
  for (const entry of deferred) {
    const fingerprint = entry.title + '\u0000' + entry.body;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    // Source-based ids keep coach edits stable across layout and language changes.
    const id = entry.id ?? `continuation:${fingerprint}`;
    const body = entry.id === 'manual' ? entry.body : report.staffNoteEdits?.[id] ?? entry.body;
    if (entry.id !== 'manual') staffNotes.push({ id, title: entry.title, body });
    if (body.trim()) annotations.push({ body: `${entry.title}\n${body}` });
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
  videoPieces.forEach((piece, index) => {
    const link = piece.videoLink!;
    const qr = buildQrSvg(link.url);
    if (!qr) return;
    if (!qrPage || index % qrColumns === 0 && qrY + qrRowHeight > BOTTOM) { qrPage = add(t('bookletVideoTitle')); const help = lines(M, TOP + 6, qrHelp, WIDTH, 6.5); qrPage.elements.push(...help); qrY = TOP + 8 + help.length * 9; }
    const x = M + (index % qrColumns) * qrCell;
    qrPage.elements.push(fitBookletCourt(qr, x, qrY, qrSize, qrSize, `qr${index}`));
    const caption = [piece.title, t(videoLinkWatchKey(link)), t('tacticalVideoCoverage', { available: link.actions ?? link.clips, total: link.totalActions ?? link.clips })];
    caption.flatMap((line) => wrapBookletText(line, qrCell - 8, 6.5)).slice(0, 4)
      .forEach((line, j) => qrPage!.elements.push(text(x, qrY + qrSize + 9 + j * 8.5, line, 6.5, j === 0)));
    if (index % qrColumns === qrColumns - 1) qrY += qrRowHeight;
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
  const footer = `${APP_METADATA.name} · ${APP_METADATA.author.name} · ${APP_METADATA.urls.webApp} · ${t('bookletFreeSoftware')} · GNU AGPL v3 or later (${APP_METADATA.license})`;
  const footerSize = Math.min(4.5, WIDTH / Math.max(1, [...footer].length * .64));
  return {
    pages: pages.map((page, i) => `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}"><rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="65" fill="${color}"/>${text(M, 18, report.opponent.name, 8, true, '#fff')}${wrapBookletText(page.title, WIDTH, 13).slice(0, 2).map((line, j) => text(M, 36 + j * 15, line, 13, true, '#fff')).join('')}${text(M, 77, wrapBookletText(context, WIDTH, 6)[0] ?? '', 6)}${page.elements.join('')}<line x1="${M}" y1="${pageHeight - 23}" x2="${pageWidth - M}" y2="${pageHeight - 23}" stroke="#cbd5e1"/>${text(M, pageHeight - 15, footer, footerSize)}${text(M, pageHeight - 5, `${i + 1} / ${pages.length}`, 5)}</svg>`),
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

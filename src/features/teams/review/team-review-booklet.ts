// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pages of the team review booklet, in the frame of the tactical booklet (A5
 * pages, coloured header, signed footer) so the same exports apply: A5 PDF,
 * A4 sheets to fold, web link.
 */
import { APP_METADATA } from '@src/lib/constants/app';
import { formatDisplayDate } from '@src/lib/utils/local-date';
import { RADAR_AXES, DEFAULT_RADAR_AXIS_IDS } from '@src/features/analytics/radar/model/radar-metrics';
import { BOOKLET_HEIGHT, BOOKLET_WIDTH, DEFAULT_BOOKLET, wrapBookletText, type ReportBookletPlan } from '@src/features/opponent-reports/model/report-booklet';
import { buildQrSvg } from '@src/features/opponent-reports/model/qr-svg';
import type { TeamReviewData, TeamReviewPlayer } from './team-review-model';

export type ReviewT = (key: string, params?: Record<string, string | number>) => string;

const M = 20;
const TOP = 87;
const INK = '#142e42';
const ACCENT = '#007e80';
const MUTED = '#64748b';
const GOOD = '#16a34a';
const WEAK = '#dc2626';
const WIDTH = BOOKLET_WIDTH - M * 2;
const BOTTOM = BOOKLET_HEIGHT - 37;

const xml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
const text = (x: number, y: number, value: string, size = 8, bold = false, fill = INK, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}"${bold ? ' font-weight="bold"' : ''} fill="${fill}" text-anchor="${anchor}" xml:space="preserve">${xml(value)}</text>`;
const pct = (value: number | null | undefined, digits = 0) => (value === null || value === undefined || !Number.isFinite(value) ? '–' : `${(value * 100).toFixed(digits)}%`);
const ratio = (part: number, total: number) => (total > 0 ? part / total : null);

interface Page { title: string; elements: string[] }

/** Axes drawn as their own scale: rates 0..100%, efficiencies −100..+100%. */
function axisRange(axisId: string): [number, number] {
  const axis = RADAR_AXES.find((item) => item.id === axisId);
  return axis ? [axis.theoreticalMin, axis.theoreticalMax] : [0, 1];
}

function trendChart(data: TeamReviewData, axisId: string, x: number, y: number, width: number, height: number, t: ReviewT): string[] {
  const axis = RADAR_AXES.find((item) => item.id === axisId)!;
  const [min, max] = axisRange(axisId);
  const values = data.trend.map((point) => point.values[axis.id]).filter((value): value is number => value !== null && value !== undefined);
  const delta = data.deltas.find((item) => item.axis === axis.id);
  const plotTop = y + 16;
  const plotHeight = height - 30;
  const px = (index: number) => x + (data.trend.length <= 1 ? width / 2 : (index / (data.trend.length - 1)) * width);
  const py = (value: number) => plotTop + plotHeight - ((value - min) / (max - min)) * plotHeight;
  const out = [
    text(x, y + 8, t(axis.labelKey), 7.5, true),
    `<rect x="${x}" y="${plotTop}" width="${width}" height="${plotHeight}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="0.5"/>`,
  ];
  if (min < 0) out.push(`<line x1="${x}" y1="${py(0)}" x2="${x + width}" y2="${py(0)}" stroke="#cbd5e1" stroke-width="0.5"/>`);
  if (delta?.average !== null && delta?.average !== undefined) {
    out.push(`<line x1="${x}" y1="${py(delta.average)}" x2="${x + width}" y2="${py(delta.average)}" stroke="${MUTED}" stroke-width="0.7" stroke-dasharray="3 2"/>`);
  }
  const points = data.trend
    .map((point, index) => ({ index, value: point.values[axis.id] }))
    .filter((point): point is { index: number; value: number } => point.value !== null && point.value !== undefined);
  if (points.length > 1) {
    out.push(`<polyline fill="none" stroke="${ACCENT}" stroke-width="1.2" points="${points.map((point) => `${px(point.index).toFixed(1)},${py(point.value).toFixed(1)}`).join(' ')}"/>`);
  }
  points.forEach((point) => out.push(`<circle cx="${px(point.index).toFixed(1)}" cy="${py(point.value).toFixed(1)}" r="1.8" fill="${ACCENT}"/>`));
  if (values.length) {
    const change = delta?.delta;
    const tone = change === null || change === undefined ? MUTED : change >= 0 ? GOOD : WEAK;
    out.push(text(x, y + height - 2, t('teamReviewLatestVsAverage', { latest: pct(delta?.latest), average: pct(delta?.average) }), 6, false, tone));
  }
  return out;
}

function playerCard(player: TeamReviewPlayer, x: number, y: number, width: number, height: number, t: ReviewT): string[] {
  const out = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" fill="#f8fafc" stroke="#e2e8f0" stroke-width="0.6"/>`,
    text(x + 8, y + 14, `#${player.jersey} ${player.name}`, 8.5, true),
    text(x + 8, y + 24, t('teamReviewPlayerMatches', { count: player.matches }), 6, false, MUTED),
  ];
  const rows: Array<[string, string]> = [];
  if (player.attack.total) rows.push([t('skillAttack'), t('teamReviewAttackLine', { total: player.attack.total, kill: pct(ratio(player.attack.points, player.attack.total)), errors: player.attack.errors + player.attack.blocked })]);
  if (player.receive.total) rows.push([t('skillReceive'), t('teamReviewReceiveLine', { total: player.receive.total, positive: pct(ratio(player.receive.positive, player.receive.total)), perfect: pct(ratio(player.receive.perfect, player.receive.total)) })]);
  if (player.serve.total) rows.push([t('skillServe'), t('teamReviewServeLine', { total: player.serve.total, aces: player.serve.aces, errors: player.serve.errors })]);
  if (player.blockPoints) rows.push([t('skillBlock'), t('teamReviewBlockLine', { points: player.blockPoints })]);
  const textWidth = player.videoUrl ? width - 70 : width - 16;
  let rowY = y + 38;
  for (const [label, value] of rows) {
    out.push(text(x + 8, rowY, label, 6.5, true, ACCENT));
    wrapBookletText(value, textWidth, 6.5).slice(0, 2).forEach((line, index) => out.push(text(x + 8, rowY + 9 + index * 8.5, line, 6.5)));
    rowY += 27;
  }
  const qr = player.videoUrl ? buildQrSvg(player.videoUrl) : null;
  if (qr) {
    const size = 54;
    const inner = qr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const viewBox = qr.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100';
    out.push(`<svg x="${x + width - size - 8}" y="${y + 30}" width="${size}" height="${size}" viewBox="${viewBox}">${inner}</svg>`);
    out.push(text(x + width - size / 2 - 8, y + 30 + size + 8, t('teamReviewVideo'), 5.5, false, MUTED, 'middle'));
  }
  return out;
}

export function buildTeamReviewBooklet(data: TeamReviewData, t: ReviewT, options: { notes?: string; title?: string } = {}): ReportBookletPlan {
  const pages: Page[] = [];
  const add = (title: string): Page => { const page = { title, elements: [] as string[] }; pages.push(page); return page; };
  const title = options.title ?? t('teamReviewTitle', { team: data.teamName });

  // 1. Matches and record.
  let page = add(t('teamReviewMatches'));
  page.elements.push(text(M, TOP + 6, t('teamReviewRecord', { won: data.wins, lost: data.losses, total: data.matches.length }), 11, true));
  let y = TOP + 26;
  for (const match of data.matches) {
    if (y > BOTTOM - 10) { page = add(t('teamReviewMatches')); y = TOP + 6; }
    const won = match.setsFor > match.setsAgainst;
    page.elements.push(text(M, y, formatDisplayDate(match.playedAt ?? '') || '', 7.5, false, MUTED));
    page.elements.push(text(M + 62, y, match.opponent, 7.5));
    page.elements.push(text(M + WIDTH, y, `${match.setsFor}-${match.setsAgainst}`, 7.5, true, won ? GOOD : WEAK, 'end'));
    y += 13;
  }

  // 2. Season trend: one small chart per main indicator.
  if (data.trend.length) {
    page = add(t('teamReviewTrend'));
    page.elements.push(text(M, TOP + 2, t('teamReviewTrendNote'), 6.5, false, MUTED));
    const chartWidth = (WIDTH - 14) / 2;
    const chartHeight = 92;
    DEFAULT_RADAR_AXIS_IDS.forEach((axisId, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      page.elements.push(...trendChart(data, axisId, M + column * (chartWidth + 14), TOP + 12 + row * (chartHeight + 12), chartWidth, chartHeight, t));
    });
  }

  // 3. Training priorities and rotations to work on.
  page = add(t('teamReviewPriorities'));
  y = TOP + 4;
  page.elements.push(...wrapBookletText(t('teamReviewPrioritiesNote'), WIDTH, 6.5).map((line, index) => text(M, y + index * 9, line, 6.5, false, MUTED)));
  y += 24;
  if (!data.priorities.length) {
    page.elements.push(...wrapBookletText(t('teamReviewNoPriorities'), WIDTH, 8).map((line, index) => text(M, y + index * 11, line, 8)));
    y += 30;
  }
  data.priorities.forEach((item, index) => {
    const isRate = item.category.kind === 'radar';
    const show = (value: number | null) => (value === null ? '–' : isRate ? pct(value) : value.toFixed(2));
    page.elements.push(`<rect x="${M}" y="${y}" width="${WIDTH}" height="30" rx="5" fill="${index < 3 ? '#eaf3f3' : '#f8fafc'}"/>`);
    page.elements.push(text(M + 8, y + 12, `${index + 1}. ${t(item.category.labelKey)}`, 8.5, true));
    page.elements.push(text(M + 8, y + 23, t('teamReviewPriorityLine', { current: show(item.current), benchmark: show(item.benchmark), n: item.sampleSize }), 6.5, false, MUTED));
    y += 36;
  });
  if (data.weakRotations.length) {
    y += 6;
    page.elements.push(text(M, y, t('teamReviewWeakRotations'), 8.5, true, ACCENT));
    y += 13;
    for (const weak of data.weakRotations.slice(0, 6)) {
      page.elements.push(text(M + 8, y, t('teamReviewWeakRotationLine', {
        rotation: weak.rotation,
        phase: t(weak.phase === 'sideOut' ? 'teamReviewSideOut' : 'teamReviewBreakPoint'),
        rate: pct(weak.percentage),
        n: weak.attempts,
      }), 7.5));
      y += 11;
    }
  }

  // 4. Rotations: side-out and break point, P1-P6.
  if (data.rotations.some((rotation) => rotation.sideOut.attempts || rotation.breakPoint.attempts)) {
    page = add(t('teamReviewRotations'));
    const rowHeight = 62;
    const barMax = WIDTH - 70;
    data.rotations.forEach((rotation, index) => {
      const rowY = TOP + 8 + index * rowHeight;
      page.elements.push(text(M, rowY + 14, `P${rotation.rotation}`, 12, true));
      ([['sideOut', 'teamReviewSideOut'], ['breakPoint', 'teamReviewBreakPoint']] as const).forEach(([phase, labelKey], line) => {
        const value = rotation[phase];
        const barY = rowY + line * 24;
        const width = value.percentage === null ? 0 : Math.max(1, value.percentage * barMax);
        const fill = value.tone === 'green' ? GOOD : value.tone === 'red' ? WEAK : '#94a3b8';
        page.elements.push(text(M + 40, barY + 4, t(labelKey), 6.5, false, MUTED));
        page.elements.push(`<rect x="${M + 40}" y="${barY + 7}" width="${barMax}" height="9" rx="2" fill="#eef2f7"/>`);
        page.elements.push(`<rect x="${M + 40}" y="${barY + 7}" width="${width.toFixed(1)}" height="9" rx="2" fill="${fill}"/>`);
        page.elements.push(text(M + WIDTH, barY + 15, `${pct(value.percentage)} (${value.wins}/${value.attempts})`, 6.5, true, INK, 'end'));
      });
    });
  }

  // 5. Player cards, four per page.
  const cardWidth = (WIDTH - 10) / 2;
  const cardHeight = (BOTTOM - TOP - 10) / 2;
  data.players.forEach((player, index) => {
    if (index % 4 === 0) page = add(t('teamReviewPlayers'));
    const slot = index % 4;
    page.elements.push(...playerCard(player, M + (slot % 2) * (cardWidth + 10), TOP + Math.floor(slot / 2) * (cardHeight + 10), cardWidth, cardHeight, t));
  });

  // 6. Staff notes, then lined pages up to a multiple of four (booklet sheets).
  const lined = (target: Page, from: number) => {
    for (let lineY = from; lineY < BOTTOM; lineY += 26) target.elements.push(`<line x1="${M}" y1="${lineY}" x2="${M + WIDTH}" y2="${lineY}" stroke="#cbd5e1" stroke-width="0.5"/>`);
  };
  page = add(t('bookletNotes'));
  const noteLines = options.notes?.trim() ? wrapBookletText(options.notes.trim(), WIDTH, 8.5) : [];
  noteLines.forEach((line, index) => page.elements.push(text(M, TOP + 6 + index * 12, line, 8.5)));
  lined(page, TOP + 20 + noteLines.length * 12);
  const contentPages = pages.length;
  while (pages.length % 4 !== 0) lined(add(t('bookletNotes')), TOP + 20);

  const footer = `${APP_METADATA.name} · ${APP_METADATA.author.displayName} · ${APP_METADATA.urls.webApp} · ${t('bookletFreeSoftware')} · GNU AGPL v3 or later (${APP_METADATA.license})`;
  const footerSize = Math.min(4.5, WIDTH / Math.max(1, [...footer].length * 0.64));
  const attributionLines = wrapBookletText(t('tacticalAttributionFooter'), WIDTH, 3.8).slice(0, 2);
  const context = `${title} · ${t('teamReviewRecord', { won: data.wins, lost: data.losses, total: data.matches.length })}`;
  return {
    pages: pages.map((item, index) => `<svg xmlns="http://www.w3.org/2000/svg" width="${BOOKLET_WIDTH}" height="${BOOKLET_HEIGHT}" viewBox="0 0 ${BOOKLET_WIDTH} ${BOOKLET_HEIGHT}"><rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="65" fill="${INK}"/>${text(M, 18, data.teamName, 8, true, '#fff')}${wrapBookletText(item.title, WIDTH, 13).slice(0, 2).map((line, row) => text(M, 36 + row * 15, line, 13, true, '#fff')).join('')}${text(M, 77, wrapBookletText(context, WIDTH, 6)[0] ?? '', 6)}${item.elements.join('')}<line x1="${M}" y1="${BOOKLET_HEIGHT - 30}" x2="${BOOKLET_WIDTH - M}" y2="${BOOKLET_HEIGHT - 30}" stroke="#cbd5e1"/>${text(M, BOOKLET_HEIGHT - 24, footer, footerSize)}${attributionLines.map((line, row) => text(M, BOOKLET_HEIGHT - 18 + row * 4.6, line, 3.8)).join('')}${text(M, BOOKLET_HEIGHT - 4, `${index + 1} / ${pages.length}`, 5)}</svg>`),
    width: BOOKLET_WIDTH,
    height: BOOKLET_HEIGHT,
    contentPages,
    paddingPages: pages.length - contentPages,
    sheets: pages.length / 4,
    format: DEFAULT_BOOKLET,
  };
}

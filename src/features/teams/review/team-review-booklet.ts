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
import {
  DEFAULT_TEAM_REVIEW_CONFIG,
  type TeamReviewConfig,
  type TeamReviewData,
  type TeamReviewPlayer,
} from './team-review-model';
import {
  renderAttackDirectionsSvg,
  renderPairedBarsChart,
  renderPlayerTrendLineChart,
  renderRadarChartSvg,
  renderStackedEvaluationBar,
  renderZoneHeatmapCourtSvg,
} from './team-review-charts';

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
const pct = (value: number | null | undefined, digits = 0) => (value === null || value === undefined || !Number.isFinite(value) ? '-' : `${(value * 100).toFixed(digits)}%`);
const ratio = (part: number, total: number) => (total > 0 ? part / total : null);
const eff = (points: number, errors: number, blocked: number, total: number) => (total > 0 ? (points - errors - blocked) / total : null);

interface Page { title: string; elements: string[] }

function axisRange(axisId: string): [number, number] {
  const axis = RADAR_AXES.find((item) => item.id === axisId);
  return axis ? [axis.theoreticalMin, axis.theoreticalMax] : [0, 1];
}

function buildAxisLabels(t: ReviewT): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const axis of RADAR_AXES) {
    labels[axis.id] = t(axis.labelKey);
  }
  return labels;
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

function kpiBox(x: number, y: number, w: number, h: number, label: string, value: string, sub = '', tone = INK): string[] {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.6"/>`,
    text(x + 7, y + 11, label, 6.2, false, MUTED),
    text(x + 7, y + 24, value, 10.5, true, tone),
    ...(sub ? [text(x + 7, y + 34, sub, 5.6, false, MUTED)] : []),
  ];
}

function drawPlayerPages(
  add: (title: string) => Page,
  player: TeamReviewPlayer,
  data: TeamReviewData,
  config: TeamReviewConfig,
  axisLabels: Record<string, string>,
  t: ReviewT,
): void {
  const ts = data.teamSummary;
  const extended = config.detailLevel === 'extended';
  const pageTitle = `${t('teamReviewPlayers')} · #${player.jersey} ${player.name}`;
  const page = add(pageTitle);
  let y = TOP + 2;

  // Header + optional QR
  const qr = player.videoUrl ? buildQrSvg(player.videoUrl) : null;
  const headerH = qr ? 60 : 38;
  page.elements.push(`<rect x="${M}" y="${y}" width="${WIDTH}" height="${headerH}" rx="5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.7"/>`);
  const roleLabel = player.role ? ` · ${t(player.role)}` : '';
  page.elements.push(text(M + 8, y + 14, `#${player.jersey} ${player.name}${roleLabel}`, 9.5, true));
  page.elements.push(text(M + 8, y + 25, `${t('teamReviewPlayerMatches', { count: player.matches })} · ${t('teamReviewPointsLabel')}: ${player.points} · ${t('teamReviewErrorsLabel')}: ${player.errors}`, 6.5, false, MUTED));
  if (qr) {
    const size = 46;
    const inner = qr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const viewBox = qr.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100';
    page.elements.push(`<svg x="${M + WIDTH - size - 6}" y="${y + 4}" width="${size}" height="${size}" viewBox="${viewBox}">${inner}</svg>`);
    page.elements.push(text(M + WIDTH - size / 2 - 6, y + 56, t('teamReviewVideo'), 5, false, MUTED, 'middle'));
  }
  y += headerH + 8;

  // Evaluation bar charts for Attack / Receive / Serve
  if (player.attack.total > 0) {
    const atkBar = renderStackedEvaluationBar(M, y, WIDTH, t('skillAttack'), [
      { label: '#', count: player.attack.points, color: GOOD },
      { label: '+', count: player.attack.positive, color: ACCENT },
      { label: '-/!', count: player.attack.negative, color: '#f59e0b' },
      { label: '/', count: player.attack.blocked, color: '#fb923c' },
      { label: '=', count: player.attack.errors, color: WEAK },
    ]);
    page.elements.push(...atkBar.elements);
    y += atkBar.height + 4;
  }
  if (player.receive.total > 0) {
    const recBar = renderStackedEvaluationBar(M, y, WIDTH, t('skillReceive'), [
      { label: '#', count: player.receive.perfect, color: GOOD },
      { label: '+', count: Math.max(0, player.receive.positive - player.receive.perfect), color: ACCENT },
      { label: '!', count: player.receive.ok, color: '#eab308' },
      { label: '-', count: player.receive.negative, color: '#fb923c' },
      { label: '/ =', count: player.receive.slash + player.receive.errors, color: WEAK },
    ]);
    page.elements.push(...recBar.elements);
    y += recBar.height + 4;
  }
  if (player.serve.total > 0) {
    const srvBar = renderStackedEvaluationBar(M, y, WIDTH, t('skillServe'), [
      { label: 'Ace', count: player.serve.aces, color: GOOD },
      { label: '+', count: player.serve.positive, color: ACCENT },
      { label: '-/!', count: player.serve.negative, color: '#94a3b8' },
      { label: '=', count: player.serve.errors, color: WEAK },
    ]);
    page.elements.push(...srvBar.elements);
    y += srvBar.height + 6;
  }

  // Radar Comparison (Player vs Team) + Comparison Bars
  if (config.includePlayerComparison && player.radar && y + 145 <= BOTTOM) {
    const radarColW = 152;
    page.elements.push(...renderRadarChartSvg(
      M + radarColW / 2,
      y + 62,
      36,
      player.radar,
      axisLabels,
      {
        secondaryValues: data.teamRadar,
        primaryLabel: `#${player.jersey}`,
        secondaryLabel: t('teamReviewTeamCol'),
        fontSize: 5.1,
        maxCharsPerLine: 13,
        bounds: { minX: M, maxX: M + radarColW },
      },
    ));
    const compX = M + radarColW + 10;
    const compW = WIDTH - radarColW - 10;
    const comp = renderPairedBarsChart(
      compX,
      y + 2,
      compW,
      t('teamReviewPlayerComparisonTitle'),
      [
        { label: t('teamReviewCompAtkKill'), current: ratio(player.attack.points, player.attack.total), benchmark: ratio(ts.attack.points, ts.attack.total) },
        { label: t('teamReviewCompAtkEff'), current: eff(player.attack.points, player.attack.errors, player.attack.blocked, player.attack.total), benchmark: eff(ts.attack.points, ts.attack.errors, ts.attack.blocked, ts.attack.total) },
        { label: t('teamReviewCompRecPos'), current: ratio(player.receive.positive, player.receive.total), benchmark: ratio(ts.receive.positive, ts.receive.total) },
        { label: t('teamReviewCompRecPerf'), current: ratio(player.receive.perfect, player.receive.total), benchmark: ratio(ts.receive.perfect, ts.receive.total) },
        { label: t('teamReviewCompSrvAce'), current: ratio(player.serve.aces, player.serve.total), benchmark: ratio(ts.serve.aces, ts.serve.total) },
        { label: t('teamReviewCompSrvErr'), current: ratio(player.serve.errors, player.serve.total), benchmark: ratio(ts.serve.errors, ts.serve.total), invertGood: true },
      ],
      { current: `#${player.jersey}`, benchmark: t('teamReviewTeamCol') },
    );
    page.elements.push(...comp.elements);
    y += Math.max(148, comp.height + 10);
  }

  // Individual Trend Line Chart
  if (config.includePlayerTrend && player.matchPoints.length > 0 && y + 85 <= BOTTOM) {
    const trendH = Math.min(92, BOTTOM - y);
    page.elements.push(...renderPlayerTrendLineChart(
      M,
      y,
      WIDTH,
      trendH,
      t('teamReviewPlayerTrendTitle'),
      player.matchPoints.map((mp) => ({
        label: mp.opponent,
        attackKill: mp.attackKill,
        receivePos: mp.receivePos,
      })),
      { attack: t('teamReviewAtkShort'), receive: t('teamReviewRecShort') },
    ));
    y += trendH + 6;
  }

  // Page 2 for the athlete if they have heatmaps/directions or priorities (or in extended mode)
  const hasHeatmaps = player.heatmaps.attack.length > 0 || player.heatmaps.serve.length > 0 || player.heatmaps.receive.length > 0;
  const hasPriorities = config.includePlayerPriorities && player.priorities.length > 0;
  if (hasHeatmaps || hasPriorities) {
    const p2 = add(`${pageTitle} · ${t('teamReviewChartsAndPriorities')}`);
    let y2 = TOP + 4;
    if (hasHeatmaps) {
      const courtW = (WIDTH - 14) / 2;
      const courtH = 156;
      if (player.heatmaps.attack.length > 0) {
        p2.elements.push(...renderAttackDirectionsSvg(
          M,
          y2,
          courtW,
          courtH,
          t('skillAttack'),
          player.heatmaps.attack,
          { fans: t('attackDefenseLegendPrimary'), arrow: t('attackDefenseLegendScoring'), scoring: '{{points}} ({{share}}%)' },
        ));
      } else {
        p2.elements.push(...renderZoneHeatmapCourtSvg(M, y2, courtW, courtH, t('skillAttack'), player.heatmaps.attack, true));
      }
      if (player.heatmaps.receive.length > 0) {
        p2.elements.push(...renderZoneHeatmapCourtSvg(M + courtW + 14, y2, courtW, courtH, t('skillReceive'), player.heatmaps.receive, true, '217, 119, 6'));
      } else if (player.heatmaps.serve.length > 0) {
        p2.elements.push(...renderZoneHeatmapCourtSvg(M + courtW + 14, y2, courtW, courtH, t('skillServe'), player.heatmaps.serve, true, '22, 163, 74'));
      }
      y2 += courtH + 12;

      if (extended && player.heatmaps.serve.length > 0 && player.heatmaps.receive.length > 0 && y2 + 125 <= BOTTOM) {
        p2.elements.push(...renderZoneHeatmapCourtSvg(M, y2, courtW, 120, t('skillServe'), player.heatmaps.serve, true, '22, 163, 74'));
        p2.elements.push(...renderZoneHeatmapCourtSvg(M + courtW + 14, y2, courtW, 120, `${t('skillAttack')} (Zone)`, player.heatmaps.attack, true));
        y2 += 126;
      }
    }

    if (hasPriorities && y2 + 50 <= BOTTOM) {
      const barBlock = renderPairedBarsChart(
        M,
        y2,
        WIDTH,
        t('teamReviewPlayerPrioritiesTitle'),
        player.priorities.slice(0, 5).map((item) => ({
          label: t(item.category.labelKey),
          current: item.current,
          benchmark: item.benchmark,
          invertGood: item.category.kind === 'raw-rate' && !item.category.higherIsBetter,
        })),
        { current: t('prioritiesCurrentLabel'), benchmark: t('prioritiesPlayerBenchmarkLabel') },
      );
      p2.elements.push(...barBlock.elements);
    }
  }
}

export function buildTeamReviewBooklet(
  data: TeamReviewData,
  t: ReviewT,
  options: { notes?: string; title?: string; config?: Partial<TeamReviewConfig> } = {},
): ReportBookletPlan {
  const config: TeamReviewConfig = { ...DEFAULT_TEAM_REVIEW_CONFIG, ...(options.config ?? {}) };
  const extended = config.detailLevel === 'extended';
  const axisLabels = buildAxisLabels(t);
  const pages: Page[] = [];
  const add = (title: string): Page => { const page = { title, elements: [] as string[] }; pages.push(page); return page; };
  const title = options.title ?? t('teamReviewTitle', { team: data.teamName });

  // 1. Matches and record.
  if (config.includeMatches) {
    let page = add(t('teamReviewMatches'));
    page.elements.push(text(M, TOP + 6, t('teamReviewRecord', { won: data.wins, lost: data.losses, total: data.matches.length }), 11, true));
    let y = TOP + 26;
    for (const match of data.matches) {
      const rowH = extended && match.setPartials.length > 0 ? 22 : 13;
      if (y + rowH > BOTTOM - 4) { page = add(t('teamReviewMatches')); y = TOP + 6; }
      const won = match.setsFor > match.setsAgainst;
      page.elements.push(text(M, y, formatDisplayDate(match.playedAt ?? '') || '', 7.5, false, MUTED));
      page.elements.push(text(M + 62, y, match.opponent, 7.5, extended));
      page.elements.push(text(M + WIDTH, y, `${match.setsFor}-${match.setsAgainst}`, 7.5, true, won ? GOOD : WEAK, 'end'));
      if (extended && match.setPartials.length > 0) {
        page.elements.push(text(M + 62, y + 9.5, `${match.setPartials.join(', ')} (${match.pointsFor}-${match.pointsAgainst})`, 6.2, false, MUTED));
      }
      y += rowH;
    }
  }

  // 2. Team Sheet - Overview KPIs + Team Radar Chart.
  const ts = data.teamSummary;
  if (config.includeTeamOverview) {
    const page = add(t('teamReviewTeamOverviewTitle'));
    const soPct = ratio(ts.sideOut.wins, ts.sideOut.attempts);
    const bpPct = ratio(ts.breakPoint.wins, ts.breakPoint.attempts);
    const atkKill = ratio(ts.attack.points, ts.attack.total);
    const atkEff = eff(ts.attack.points, ts.attack.errors, ts.attack.blocked, ts.attack.total);
    const recPos = ratio(ts.receive.positive, ts.receive.total);
    const recPerf = ratio(ts.receive.perfect, ts.receive.total);
    const srvAce = ratio(ts.serve.aces, ts.serve.total);
    const srvErr = ratio(ts.serve.errors, ts.serve.total);

    const colW = (WIDTH - 10) / 2;
    const boxH = 38;
    const cards: Array<[string, string, string, string]> = [
      [t('teamReviewSideOut'), pct(soPct), `${ts.sideOut.wins}/${ts.sideOut.attempts} · FBSO ${pct(ts.firstBallSideOutPct)}`, ACCENT],
      [t('teamReviewBreakPoint'), pct(bpPct), `${ts.breakPoint.wins}/${ts.breakPoint.attempts} · Dig->Atk ${pct(ts.attackAfterDigKillPct)}`, ACCENT],
      [t('skillAttack'), pct(atkKill), `Eff ${pct(atkEff)} · ${ts.attack.points}/${ts.attack.total}`, INK],
      [t('skillReceive'), pct(recPos), `# ${pct(recPerf)} · ${ts.receive.total} tot`, INK],
      [t('skillServe'), pct(srvAce), `Ace ${ts.serve.aces} · = ${ts.serve.errors} (${pct(srvErr)})`, INK],
      [`${t('teamReviewPointsLabel')} / ${t('teamReviewErrorsLabel')}`, `${ts.points} / ${ts.errors}`, `${t('skillBlock')}: ${ts.block.points} · ${t('skillDig')}: ${ts.dig.total}`, INK],
    ];
    cards.forEach(([label, val, sub, tone], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      page.elements.push(...kpiBox(M + col * (colW + 10), TOP + 2 + row * (boxH + 6), colW, boxH, label, val, sub, tone));
    });

    // Team Radar Chart below KPI cards
    const radarCy = TOP + 2 + 3 * (boxH + 6) + 125;
    if (radarCy + 95 <= BOTTOM) {
      page.elements.push(...renderRadarChartSvg(
        M + WIDTH / 2,
        radarCy,
        78,
        data.teamRadar,
        axisLabels,
        {
          primaryLabel: data.teamName || t('teamReviewTeamCol'),
          bounds: { minX: M, maxX: M + WIDTH },
        },
      ));
    }
  }

  // 3. Team Sheet - Analysis Sections (Reception, Serve, Attack charts & heatmaps).
  if (config.includeTeamSections) {
    // Page A: Reception & Serve (stacked bars + Side-Out by reception + heatmaps)
    const rsPage = add(`${t('teamReviewTeamSectionsTitle')} · ${t('skillReceive')} & ${t('skillServe')}`);
    let y = TOP + 2;
    const recBar = renderStackedEvaluationBar(M, y, WIDTH, t('skillReceive'), [
      { label: '#', count: ts.receive.perfect, color: GOOD },
      { label: '+', count: Math.max(0, ts.receive.positive - ts.receive.perfect), color: ACCENT },
      { label: '!', count: ts.receive.ok, color: '#eab308' },
      { label: '-', count: ts.receive.negative, color: '#fb923c' },
      { label: '/ =', count: ts.receive.slash + ts.receive.errors, color: WEAK },
    ]);
    rsPage.elements.push(...recBar.elements);
    y += recBar.height + 6;

    const srvBar = renderStackedEvaluationBar(M, y, WIDTH, t('skillServe'), [
      { label: 'Ace', count: ts.serve.aces, color: GOOD },
      { label: '+', count: ts.serve.positive, color: ACCENT },
      { label: '-/!', count: ts.serve.negative, color: '#94a3b8' },
      { label: '=', count: ts.serve.errors, color: WEAK },
    ]);
    rsPage.elements.push(...srvBar.elements);
    y += srvBar.height + 8;

    // Side-Out by Reception Quality bar chart
    if (data.sideOutByReception.some((row) => row.attempts > 0)) {
      const soBars = renderPairedBarsChart(
        M,
        y,
        WIDTH,
        t('teamReviewSideOutByReception'),
        data.sideOutByReception.map((row) => ({
          label: `${t('skillReceive')} ${row.evaluation} (${row.wins}/${row.attempts})`,
          current: ratio(row.wins, row.attempts),
          benchmark: ratio(ts.sideOut.wins, ts.sideOut.attempts),
        })),
        { current: t('teamReviewSideOut'), benchmark: t('teamReviewTeamCol') },
      );
      rsPage.elements.push(...soBars.elements);
      y += soBars.height + 8;
    }

    // Reception & Serve Target Heatmaps side-by-side
    const courtW = (WIDTH - 14) / 2;
    const courtH = Math.min(165, BOTTOM - y);
    if (courtH >= 95) {
      rsPage.elements.push(...renderZoneHeatmapCourtSvg(M, y, courtW, courtH, t('skillReceive'), data.teamHeatmaps.receive, true, '217, 119, 6'));
      rsPage.elements.push(...renderZoneHeatmapCourtSvg(M + courtW + 14, y, courtW, courtH, t('skillServe'), data.teamHeatmaps.serve, true, '22, 163, 74'));
    }

    // Page B: Attack (stacked bar + Attack Zone Heatmap + Attack Direction Fans)
    const atkPage = add(`${t('teamReviewTeamSectionsTitle')} · ${t('skillAttack')}`);
    let ay = TOP + 2;
    const atkBar = renderStackedEvaluationBar(M, ay, WIDTH, t('skillAttack'), [
      { label: '#', count: ts.attack.points, color: GOOD },
      { label: '+', count: ts.attack.positive, color: ACCENT },
      { label: '-/!', count: ts.attack.negative, color: '#f59e0b' },
      { label: '/', count: ts.attack.blocked, color: '#fb923c' },
      { label: '=', count: ts.attack.errors, color: WEAK },
    ]);
    atkPage.elements.push(...atkBar.elements);
    ay += atkBar.height + 10;

    const atkCourtH = Math.min(220, BOTTOM - ay);
    if (atkCourtH >= 110) {
      atkPage.elements.push(...renderZoneHeatmapCourtSvg(M, ay, courtW, Math.min(185, atkCourtH), `${t('skillAttack')} (Zone)`, data.teamHeatmaps.attack, true));
      if (data.teamHeatmaps.attack.length > 0) {
        atkPage.elements.push(...renderAttackDirectionsSvg(
          M + courtW + 14,
          ay,
          courtW,
          atkCourtH,
          t('skillAttack'),
          data.teamHeatmaps.attack,
          { fans: t('attackDefenseLegendPrimary'), arrow: t('attackDefenseLegendScoring'), scoring: '{{points}} ({{share}}%)' },
        ));
      }
    }
  }

  // 4. Season trend: one small chart per main indicator.
  if (config.includeTeamTrend && data.trend.length) {
    const page = add(t('teamReviewTrend'));
    page.elements.push(text(M, TOP + 2, t('teamReviewTrendNote'), 6.5, false, MUTED));
    const chartWidth = (WIDTH - 14) / 2;
    const chartHeight = 92;
    DEFAULT_RADAR_AXIS_IDS.forEach((axisId, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      page.elements.push(...trendChart(data, axisId, M + column * (chartWidth + 14), TOP + 12 + row * (chartHeight + 12), chartWidth, chartHeight, t));
    });
  }

  // 5. Training priorities (with paired bar chart) and rotations P1-P6.
  if (config.includeTeamPriorities) {
    const page = add(t('teamReviewPriorities'));
    let y = TOP + 4;
    page.elements.push(...wrapBookletText(t('teamReviewPrioritiesNote'), WIDTH, 6.5).map((line, index) => text(M, y + index * 9, line, 6.5, false, MUTED)));
    y += 24;
    if (!data.priorities.length) {
      page.elements.push(...wrapBookletText(t('teamReviewNoPriorities'), WIDTH, 8).map((line, index) => text(M, y + index * 11, line, 8)));
      y += 30;
    } else {
      const priChart = renderPairedBarsChart(
        M,
        y,
        WIDTH,
        t('teamReviewPriorities'),
        data.priorities.map((item) => ({
          label: t(item.category.labelKey),
          current: item.current,
          benchmark: item.benchmark,
          invertGood: item.category.kind === 'raw-rate' && !item.category.higherIsBetter,
        })),
        { current: t('prioritiesCurrentLabel'), benchmark: t('prioritiesBenchmarkLabel') },
      );
      page.elements.push(...priChart.elements);
      y += priChart.height + 12;
    }
    if (data.weakRotations.length && y + 30 <= BOTTOM) {
      page.elements.push(text(M, y, t('teamReviewWeakRotations'), 8.5, true, ACCENT));
      y += 13;
      for (const weak of data.weakRotations.slice(0, 6)) {
        if (y > BOTTOM - 6) break;
        page.elements.push(text(M + 8, y, t('teamReviewWeakRotationLine', {
          rotation: weak.rotation,
          phase: t(weak.phase === 'sideOut' ? 'teamReviewSideOut' : 'teamReviewBreakPoint'),
          rate: pct(weak.percentage),
          n: weak.attempts,
        }), 7.5));
        y += 11;
      }
    }

    if (data.rotations.some((rotation) => rotation.sideOut.attempts || rotation.breakPoint.attempts)) {
      const rotPage = add(t('teamReviewRotations'));
      const rowHeight = 62;
      const barMax = WIDTH - 70;
      data.rotations.forEach((rotation, index) => {
        const rowY = TOP + 8 + index * rowHeight;
        rotPage.elements.push(text(M, rowY + 14, `P${rotation.rotation}`, 12, true));
        ([['sideOut', 'teamReviewSideOut'], ['breakPoint', 'teamReviewBreakPoint']] as const).forEach(([phase, labelKey], line) => {
          const value = rotation[phase];
          const barY = rowY + line * 24;
          const width = value.percentage === null ? 0 : Math.max(1, value.percentage * barMax);
          const fill = value.tone === 'green' ? GOOD : value.tone === 'red' ? WEAK : '#94a3b8';
          rotPage.elements.push(text(M + 40, barY + 4, t(labelKey), 6.5, false, MUTED));
          rotPage.elements.push(`<rect x="${M + 40}" y="${barY + 7}" width="${barMax}" height="9" rx="2" fill="#eef2f7"/>`);
          rotPage.elements.push(`<rect x="${M + 40}" y="${barY + 7}" width="${width.toFixed(1)}" height="9" rx="2" fill="${fill}"/>`);
          rotPage.elements.push(text(M + WIDTH, barY + 15, `${pct(value.percentage)} (${value.wins}/${value.attempts})`, 6.5, true, INK, 'end'));
        });
      });
    }
  }

  // 6. Individual player pages with radar, evaluation bars, comparison bars, trend line chart, heatmaps & priorities.
  if (config.includePlayers) {
    for (const player of data.players) {
      drawPlayerPages(add, player, data, config, axisLabels, t);
    }
  }

  // 7. Staff notes, then lined pages up to a multiple of four (booklet sheets).
  const lined = (target: Page, from: number) => {
    for (let lineY = from; lineY < BOTTOM; lineY += 26) target.elements.push(`<line x1="${M}" y1="${lineY}" x2="${M + WIDTH}" y2="${lineY}" stroke="#cbd5e1" stroke-width="0.5"/>`);
  };
  const notesPage = add(t('bookletNotes'));
  const noteLines = options.notes?.trim() ? wrapBookletText(options.notes.trim(), WIDTH, 8.5) : [];
  noteLines.forEach((line, index) => notesPage.elements.push(text(M, TOP + 6 + index * 12, line, 8.5)));
  lined(notesPage, TOP + 20 + noteLines.length * 12);
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

/**
 * What the report sheets show, already worded and coloured, shared by the
 * screen and the PDF so both say exactly the same thing. Pure given `t`.
 */
import type { OpponentReport } from '@src/domain/opponent-report/types';
import type { ReceptionSystemBlock } from '@src/domain/systems/types';
import { buildReceptionFormations, type ReceptionFormation } from './reception-formation';
import { KEY_COUNT, percent, playerLabel, type KeySuggestion } from './report-keys';
import type { AttackOutcome, OpponentReportMetrics, Ratio, ServeTarget } from './report-metrics';
import { trafficBand, type OpponentReportThresholds, type TrafficBand, type TrafficMetric } from './traffic-light';

export type ViewT = (key: string, params?: Record<string, string | number>) => string;

export interface ViewCell {
  text: string;
  band?: TrafficBand;
  /** Under the minimum sample: shown, flagged, never coloured. */
  few?: boolean;
}

export interface ViewTable {
  columns: string[];
  rows: ViewCell[][];
}

export interface ReportView {
  keys: { text: string; source: 'confirmed' | 'suggested' }[];
  overview: {
    rotations: ViewTable;
    strengths: string[];
    weaknesses: string[];
    errors: ViewTable;
    notes: string;
  };
  reception: {
    summary: string;
    good: string[];
    bad: string[];
    receivers: ViewTable;
    firstBall: ViewTable;
    positiveReception: ViewTable;
    serveTargets: string[];
    targets: ServeTarget[];
    /** Reception line-up per rotation on the chosen reception system. */
    formations: Array<{ title: string; formation: ReceptionFormation }>;
    formationSystem: string;
    notes: string;
  };
  minSample: number;
}

/** "45% (12/27)", with the band of `metric` and the few-data flag. */
function rateCell(value: Ratio, metric: TrafficMetric | null, thresholds: OpponentReportThresholds): ViewCell {
  if (value.rate === null) return { text: '–' };
  const few = value.total < thresholds.minSample;
  return {
    text: `${percent(value.rate)} (${value.count}/${value.total})`,
    band: metric && !few ? trafficBand(value.rate, metric, thresholds) : undefined,
    few,
  };
}

const plain = (text: string | number): ViewCell => ({ text: String(text) });

export const RECEPTION_NOTES_KEY = 'sheet:reception';

/** The keys to print: the kept ones, or the first suggestions when none was kept. */
export function resolveReportKeys(
  report: OpponentReport,
  suggestions: readonly KeySuggestion[],
  t: ViewT,
): ReportView['keys'] {
  if (report.keys && report.keys.length > 0) {
    return report.keys.map((key) => ({ text: key.text, source: 'confirmed' as const }));
  }
  const dismissed = new Set(report.dismissedKeyIds ?? []);
  return suggestions
    .filter((suggestion) => !dismissed.has(suggestion.id))
    .slice(0, KEY_COUNT)
    .map((suggestion) => ({ text: suggestionText(suggestion, t), source: 'suggested' as const }));
}

export function suggestionText(suggestion: KeySuggestion, t: ViewT): string {
  return t(`opponentKey_${suggestion.kind}`, suggestion.params);
}

function outcomeRow(label: string, outcome: AttackOutcome, thresholds: OpponentReportThresholds): ViewCell[] {
  return [plain(label), plain(outcome.total), rateCell(outcome.kill, 'attackKill', thresholds), rateCell(outcome.sideOut, 'sideOut', thresholds)];
}

export function buildReportView(
  report: OpponentReport,
  metrics: OpponentReportMetrics,
  suggestions: readonly KeySuggestion[],
  thresholds: OpponentReportThresholds,
  t: ViewT,
  receptionSystem: ReceptionSystemBlock,
): ReportView {
  const { minSample } = thresholds;
  const enough = (value: Ratio) => value.rate !== null && value.total >= minSample;

  // ── Overview ───────────────────────────────────────────────────────────────
  const rotations: ViewTable = {
    columns: [t('opponentReportColRotation'), t('opponentReportColStarts'), t('opponentReportColSideOut'), t('opponentReportColBreak')],
    rows: metrics.rotations.map((row) => {
      const starts = metrics.startingRotationCounts[row.rotation];
      return [
        plain(`P${row.rotation}`),
        plain(t('opponentReportStartsValue', { serve: starts.serve, receive: starts.receive })),
        rateCell(row.sideOut, 'sideOut', thresholds),
        rateCell(row.breakPoint, 'breakPoint', thresholds),
      ];
    }),
  };

  const strongAttackers = metrics.attackers.filter((row) => enough(row.kill) && trafficBand(row.kill.rate, 'attackKill', thresholds) === 'green');
  const weakAttackers = metrics.attackers.filter((row) => enough(row.kill) && trafficBand(row.kill.rate, 'attackKill', thresholds) === 'red');
  const strongReceivers = metrics.receivers.filter((row) => enough(row.positive) && trafficBand(row.positive.rate, 'receptionPositive', thresholds) === 'green');
  const weakReceivers = metrics.receivers.filter((row) => enough(row.positive) && trafficBand(row.positive.rate, 'receptionPositive', thresholds) === 'red');
  const strengths = [
    ...strongAttackers.map((row) => t('opponentReportStrongAttacker', { player: playerLabel(row.player), rate: percent(row.kill.rate), n: row.attacks })),
    ...strongReceivers.map((row) => t('opponentReportStrongReceiver', { player: playerLabel(row.player), rate: percent(row.positive.rate), n: row.receptions })),
  ];
  const weaknesses = [
    ...weakReceivers.map((row) => t('opponentReportWeakReceiver', { player: playerLabel(row.player), rate: percent(row.positive.rate), n: row.receptions })),
    ...weakAttackers.map((row) => t('opponentReportWeakAttacker', { player: playerLabel(row.player), rate: percent(row.kill.rate), n: row.attacks })),
  ];

  const errors: ViewTable = {
    columns: [t('opponentReportColPlayer'), t('opponentReportColServeErrors'), t('opponentReportColAttackErrors')],
    rows: [
      [plain(t('opponentReportTeam')), rateCell(metrics.teamErrors.serve, 'directErrors', thresholds), rateCell(metrics.teamErrors.attack, 'directErrors', thresholds)],
      ...metrics.errors
        .filter((row) => row.serve.count + row.attack.count > 0)
        .slice(0, 8)
        .map((row) => [plain(playerLabel(row.player)), rateCell(row.serve, 'directErrors', thresholds), rateCell(row.attack, 'directErrors', thresholds)]),
    ],
  };

  // ── Reception ──────────────────────────────────────────────────────────────
  const receivers: ViewTable = {
    columns: [t('opponentReportColPlayer'), t('opponentReportColPositive'), t('opponentReportColPerfect'), t('opponentReportColErrors')],
    rows: metrics.receivers.filter((row) => row.receptions > 0).map((row) => [
      plain(playerLabel(row.player)),
      rateCell(row.positive, 'receptionPositive', thresholds),
      rateCell(row.perfect, null, thresholds),
      rateCell(row.errors, null, thresholds),
    ]),
  };

  const firstBall: ViewTable = {
    columns: [t('opponentReportColReception'), t('opponentReportColCount'), t('opponentReportColKill'), t('opponentReportColAttackLost'), t('opponentReportColSideOut')],
    rows: metrics.firstBall.map((row) => [
      plain(row.evaluation),
      plain(row.receptions),
      rateCell(row.kill, 'attackKill', thresholds),
      rateCell(row.attackLost, null, thresholds),
      rateCell(row.sideOut, 'sideOut', thresholds),
    ]),
  };

  const { positiveReception } = metrics;
  const positiveTable: ViewTable = {
    columns: [t('opponentReportColSituation'), t('opponentReportColCount'), t('opponentReportColKill'), t('opponentReportColSideOut')],
    rows: [
      outcomeRow(t('opponentReportPositiveAll'), positiveReception.all, thresholds),
      outcomeRow(t('opponentReportPositiveBackRow'), positiveReception.receiverBackRow, thresholds),
      outcomeRow(t('opponentReportPositiveFrontRow'), positiveReception.receiverFrontRow, thresholds),
      outcomeRow(t('opponentReportPositiveFrontRowAttacks'), positiveReception.frontRowReceiverAttacks, thresholds),
      outcomeRow(t('opponentReportPositiveFrontRowOther'), positiveReception.frontRowReceiverOtherAttacks, thresholds),
    ],
  };

  const good: string[] = [];
  const bad: string[] = [];
  metrics.rotations.forEach((row) => {
    if (!enough(row.receptionPositive)) return;
    const band = trafficBand(row.receptionPositive.rate, 'receptionPositive', thresholds);
    const text = t('opponentReportRotationReception', { rotation: `P${row.rotation}`, rate: percent(row.receptionPositive.rate) });
    if (band === 'green') good.push(text);
    if (band === 'red') bad.push(text);
  });
  metrics.firstBall.forEach((row) => {
    if (!enough(row.sideOut)) return;
    const band = trafficBand(row.sideOut.rate, 'sideOut', thresholds);
    const text = t('opponentReportFirstBallLine', { evaluation: row.evaluation, rate: percent(row.sideOut.rate) });
    if (band === 'green') good.push(text);
    if (band === 'red') bad.push(text);
  });
  const { receiverFrontRow, receiverBackRow } = positiveReception;
  if (receiverFrontRow.total >= minSample && receiverBackRow.total >= minSample
    && receiverFrontRow.kill.rate !== null && receiverBackRow.kill.rate !== null) {
    const difference = receiverBackRow.kill.rate - receiverFrontRow.kill.rate;
    if (difference >= 0.08) {
      bad.push(t('opponentKey_frontRowReceiver', { front: percent(receiverFrontRow.kill.rate), back: percent(receiverBackRow.kill.rate) }));
    }
  }

  return {
    keys: resolveReportKeys(report, suggestions, t),
    overview: { rotations, strengths, weaknesses, errors, notes: report.notes },
    reception: {
      summary: t('opponentReportReceptionSummary', {
        positive: percent(metrics.receptionTeam.positive.rate),
        errors: percent(metrics.receptionTeam.errors.rate),
        n: metrics.receptionTeam.positive.total,
      }),
      good,
      bad,
      receivers,
      firstBall,
      positiveReception: positiveTable,
      serveTargets: metrics.serveTargets.map((target) => t('opponentReportServeTargetLine', {
        rotation: `P${target.rotation}`,
        player: playerLabel(target.player),
        zone: target.zone ?? '–',
        rate: percent(target.positive.rate),
        n: target.positive.total,
        inRotation: target.inRotation.total,
      })),
      targets: metrics.serveTargets,
      formations: buildReceptionFormations(metrics, receptionSystem, thresholds).map((formation) => ({
        title: t('opponentReportFormationTitle', {
          rotation: `P${formation.rotation}`,
          rate: percent(formation.receptionPositive?.rate ?? null),
          n: formation.receptions,
        }),
        formation,
      })),
      formationSystem: t('opponentReportFormationSystem', { name: receptionSystem.name || t('untitledSystem') }),
      notes: report.freeTexts[RECEPTION_NOTES_KEY] ?? '',
    },
    minSample,
  };
}

// ── Serve target court ─────────────────────────────────────────────────────

/** DataVolley zones on the receiving half, net at the top: 4 3 2 / 7 8 9 / 5 6 1. */
const ZONE_GRID: readonly (readonly string[])[] = [['4', '3', '2'], ['7', '8', '9'], ['5', '6', '1']];

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

/**
 * The opponent's receiving half (net on top, thicker; 3 m line), with each
 * serve target written in its zone: "P4 #7". Self-contained SVG, used on
 * screen and in the PDF.
 */
export function buildServeTargetCourtSvg(targets: readonly ServeTarget[], netLabel: string): string {
  const width = 270;
  const height = 300;
  const margin = 15;
  const courtWidth = width - 2 * margin;
  const courtTop = 30;
  const courtHeight = height - courtTop - margin;
  const cellWidth = courtWidth / 3;
  const attackLine = courtTop + courtHeight / 3;
  const cellHeights = [courtHeight / 3, courtHeight / 3, courtHeight / 3];
  const labelsByZone = new Map<string, string[]>();
  targets.forEach((target) => {
    if (!target.zone) return;
    const label = `P${target.rotation} #${target.player.jersey || '?'}`;
    labelsByZone.set(target.zone, [...(labelsByZone.get(target.zone) ?? []), label]);
  });

  const cells: string[] = [];
  let y = courtTop;
  ZONE_GRID.forEach((row, rowIndex) => {
    row.forEach((zone, columnIndex) => {
      const x = margin + columnIndex * cellWidth;
      const labels = labelsByZone.get(zone) ?? [];
      const fill = labels.length > 0 ? '#fde2e2' : '#f6f8fb';
      cells.push(`<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeights[rowIndex]}" fill="${fill}" stroke="#c3cede" stroke-width="0.6"/>`);
      cells.push(`<text x="${x + 6}" y="${y + 13}" font-size="10" fill="#7f93b4">${zone}</text>`);
      labels.slice(0, 4).forEach((label, index) => {
        cells.push(`<text x="${x + cellWidth / 2}" y="${y + 32 + index * 13}" font-size="11" font-weight="bold" fill="#991b1b" text-anchor="middle">${escapeXml(label)}</text>`);
      });
    });
    y += cellHeights[rowIndex];
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    ...cells,
    `<rect x="${margin}" y="${courtTop}" width="${courtWidth}" height="${courtHeight}" fill="none" stroke="#002554" stroke-width="1.5"/>`,
    `<line x1="${margin}" y1="${attackLine}" x2="${margin + courtWidth}" y2="${attackLine}" stroke="#002554" stroke-width="1" stroke-dasharray="4 3"/>`,
    `<line x1="${margin - 8}" y1="${courtTop}" x2="${margin + courtWidth + 8}" y2="${courtTop}" stroke="#002554" stroke-width="4"/>`,
    `<text x="${width / 2}" y="${courtTop - 8}" font-size="10" fill="#002554" text-anchor="middle">${escapeXml(netLabel)}</text>`,
    '</svg>',
  ].join('');
}

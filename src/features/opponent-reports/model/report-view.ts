/**
 * What the report sheets show, already worded and coloured, shared by the
 * screen and the PDF so both say exactly the same thing. Pure given `t`.
 */
import type { OpponentReport } from '@src/domain/opponent-report/types';
import type { ReceptionSystemBlock } from '@src/domain/systems/types';
import { isSideOutDistributionTarget, SIDEOUT_TARGET_TRANSLATION_KEYS } from '@src/features/analytics/sideout/sideout-distribution';
import { buildDensityGrid } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import {
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_SURFACE_WIDTH,
} from '@src/domain/spatial/types';
import type { AttackingReportMetrics, AttackPerformance } from './attacking-metrics';
import type { AttackerVideoLink } from './attacker-video-links';
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
  attackers: Array<{
    player: OpponentReportMetrics['attackers'][number]['player'];
    courtSvg: string;
    courtSample: string;
    highlights: ViewTable;
    performance: ViewTable;
    distribution: ViewTable;
    notes: string;
    videoLink?: AttackerVideoLink;
  }>;
  setter: {
    distribution: ViewTable;
    notes: string;
  };
  minSample: number;
}

/** "45% (12/27)", with the band of `metric` and the few-data flag. */
function rateCell(value: Ratio, metric: TrafficMetric | null, thresholds: OpponentReportThresholds): ViewCell {
  const few = value.total < thresholds.minSample;
  if (value.rate === null) return { text: '–', few };
  return {
    text: `${percent(value.rate)} (${value.count}/${value.total})`,
    band: metric && !few ? trafficBand(value.rate, metric, thresholds) : undefined,
    few,
  };
}

const plain = (text: string | number): ViewCell => ({ text: String(text) });
const ATTACK_VALUE_TRANSLATION_KEYS: Record<string, string> = {
  power: 'opponentReportAttackTypePower',
  tip: 'opponentReportAttackTypeTip',
  roll_shot: 'opponentReportAttackTypeRollShot',
  line: 'opponentReportAttackDirectionLine',
  cross: 'opponentReportAttackDirectionCross',
  block_out: 'opponentReportAttackTypeBlockOut',
  first_tempo: 'opponentReportAttackTempoFirst',
  second_tempo: 'opponentReportAttackTempoSecond',
  third_tempo: 'opponentReportAttackTempoThird',
  high_ball: 'opponentReportAttackTempoHighBall',
  pipe: 'opponentReportAttackTempoPipe',
  back_row: 'opponentReportAttackTempoBackRow',
  other: 'opponentReportAttackTypeOther',
};

export const RECEPTION_NOTES_KEY = 'sheet:reception';
export const SETTER_NOTES_KEY = 'sheet:setter';
export const attackerNotesKey = (playerKey: string) => `attacker:${playerKey}`;

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

function buildAttackerCourtSvg(events: AttackingReportMetrics['attackers'][number]['directionsForDrawing'], title: string): string {
  const width = 270;
  const height = 250;
  const margin = 14;
  const courtWidth = width - margin * 2;
  const courtHeight = height - margin * 2;
  const toX = (value: number) => margin + ((value - SCOUTING_SURFACE_INSET_X) / SCOUTING_SURFACE_WIDTH) * courtWidth;
  const toY = (value: number) => margin + ((value - SCOUTING_SURFACE_INSET_Y) / SCOUTING_SURFACE_HEIGHT) * courtHeight;
  const grid = buildDensityGrid(events, true, 9, 9);
  const arrows = events.slice(0, 40).map((event) => (
    `<line x1="${toX(event.start.x)}" y1="${toY(event.start.y)}" x2="${toX(event.end.x)}" y2="${toY(event.end.y)}" stroke="#1d4ed8" stroke-opacity="0.62" stroke-width="1.5" marker-end="url(#arrow)"/>`
  ));
  const heat = grid.cells.map((cell) => {
    const radius = 4 + cell.density * 11;
    return `<circle cx="${toX(cell.x)}" cy="${toY(cell.y)}" r="${radius}" fill="#dc2626" fill-opacity="${0.18 + cell.density * 0.52}"/>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(title)}</title>`,
    '<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#1d4ed8"/></marker></defs>',
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<rect x="${margin}" y="${margin}" width="${courtWidth}" height="${courtHeight}" fill="#f8fafc" stroke="#002554" stroke-width="1.5"/>`,
    `<line x1="${toX(50)}" y1="${margin}" x2="${toX(50)}" y2="${margin + courtHeight}" stroke="#002554" stroke-width="3"/>`,
    `<line x1="${toX(31)}" y1="${margin}" x2="${toX(31)}" y2="${margin + courtHeight}" stroke="#64748b" stroke-dasharray="4 3"/>`,
    `<line x1="${toX(69)}" y1="${margin}" x2="${toX(69)}" y2="${margin + courtHeight}" stroke="#64748b" stroke-dasharray="4 3"/>`,
    ...heat,
    ...arrows,
    '</svg>',
  ].join('');
}

function performanceCell(value: number | null, sample: AttackPerformance, thresholds: OpponentReportThresholds): ViewCell {
  const few = sample.attacks < thresholds.minSample;
  if (value === null) return { text: '–', few };
  return {
    text: `${percent(value)} (${sample.attacks})`,
    band: few ? undefined : trafficBand(value, 'attackKill', thresholds),
    few,
  };
}

function distributionRows(
  label: string,
  entries: Array<{ value: string; count: number; matches: number }>,
  thresholds: OpponentReportThresholds,
  translateValue: (value: string) => string = (value) => value,
): ViewCell[][] {
  return entries.map((entry) => [
    plain(label),
    plain(translateValue(entry.value)),
    { ...plain(entry.count), few: entry.count < thresholds.minSample },
    plain(entry.matches),
  ]);
}

function attackDistributionView(
  metrics: AttackingReportMetrics,
  report: OpponentReport,
  thresholds: OpponentReportThresholds,
  t: ViewT,
  videoLinks: ReadonlyMap<string, AttackerVideoLink>,
): ReportView['attackers'] {
  return metrics.attackers.map((attacker) => {
    const translateAttackValue = (value: string) => {
      const key = ATTACK_VALUE_TRANSLATION_KEYS[value.toLowerCase()];
      return key ? t(key) : value;
    };
    const situations: Array<[string, AttackPerformance]> = [
      [t('opponentReportAttackAll'), attacker.all],
      [t('opponentReportAttackAfterReceive'), attacker.afterReceive],
      [t('opponentReportAttackAfterDig'), attacker.afterDig],
      [t('opponentReportAttackAfterNegativeReception'), attacker.afterNegativeReception],
      [t('opponentReportAttackHighBall'), attacker.highBall],
      [t('opponentReportAttackLateSet'), attacker.lateSet],
      [t('opponentReportAttackEvaluationBang'), attacker.evaluationBang],
      [t('opponentReportAttackEvaluationMinus'), attacker.evaluationMinus],
    ];
    const performance: ViewTable = {
      columns: [
        t('opponentReportColSituation'),
        t('opponentReportColSample'),
        t('opponentReportColEfficiency'),
        t('opponentReportColKill'),
        t('opponentReportColErrors'),
      ],
      rows: situations.map(([label, row]) => [
        plain(label),
        plain(t('opponentReportMetricSample', { matches: row.matches, actions: row.attacks })),
        performanceCell(row.efficiency, row, thresholds),
        rateCell(row.kill, 'attackKill', thresholds),
        rateCell(row.errors, 'directErrors', thresholds),
      ]),
    };
    const pressureSituations: Array<[string, AttackPerformance]> = [
      [t('opponentReportAttackAfterNegativeReception'), attacker.afterNegativeReception],
      [t('opponentReportAttackHighBall'), attacker.highBall],
      [t('opponentReportAttackLateSet'), attacker.lateSet],
    ];
    const pressureRows = pressureSituations.filter(([, row]) => row.efficiency !== null && row.attacks > 0);
    const weakestPressure = pressureRows.sort((left, right) => (
      (left[1].efficiency ?? Number.POSITIVE_INFINITY) - (right[1].efficiency ?? Number.POSITIVE_INFINITY)
    ))[0];
    const highlights: ViewTable = {
      columns: [
        t('opponentReportColSituation'),
        t('opponentReportColEfficiency'),
        t('opponentReportColSample'),
      ],
      rows: [
        [plain(t('opponentReportAttackAll')), performanceCell(attacker.all.efficiency, attacker.all, thresholds),
          plain(t('opponentReportMetricSample', { matches: attacker.all.matches, actions: attacker.all.attacks }))],
        [plain(t('opponentReportAttackAfterReceive')), performanceCell(attacker.afterReceive.efficiency, attacker.afterReceive, thresholds),
          plain(t('opponentReportMetricSample', { matches: attacker.afterReceive.matches, actions: attacker.afterReceive.attacks }))],
        [plain(t('opponentReportAttackAfterDig')), performanceCell(attacker.afterDig.efficiency, attacker.afterDig, thresholds),
          plain(t('opponentReportMetricSample', { matches: attacker.afterDig.matches, actions: attacker.afterDig.attacks }))],
        [
          plain(t('opponentReportAttackPressure')),
          weakestPressure
            ? performanceCell(weakestPressure[1].efficiency, weakestPressure[1], thresholds)
            : { ...plain('–'), few: true },
          plain(weakestPressure
            ? `${weakestPressure[0]} · ${t('opponentReportMetricSample', {
              matches: weakestPressure[1].matches,
              actions: weakestPressure[1].attacks,
            })}`
            : '–'),
        ],
      ],
    };
    const distribution: ViewTable = {
      columns: [
        t('opponentReportColCategory'),
        t('opponentReportColValue'),
        t('opponentReportColCount'),
        t('opponentReportColMatches'),
      ],
      rows: [
        ...distributionRows(t('opponentReportAttackZone'), attacker.all.zones, thresholds),
        ...distributionRows(t('opponentReportAttackDirection'), attacker.all.directions, thresholds, translateAttackValue),
        ...distributionRows(t('opponentReportAttackType'), attacker.all.types, thresholds, translateAttackValue),
        ...distributionRows(`${t('opponentReportAttackAfterReceive')} · ${t('opponentReportAttackZone')}`, attacker.afterReceive.zones, thresholds),
        ...distributionRows(`${t('opponentReportAttackAfterReceive')} · ${t('opponentReportAttackDirection')}`, attacker.afterReceive.directions, thresholds, translateAttackValue),
        ...distributionRows(`${t('opponentReportAttackAfterReceive')} · ${t('opponentReportAttackType')}`, attacker.afterReceive.types, thresholds, translateAttackValue),
        ...distributionRows(`${t('opponentReportAttackAfterDig')} · ${t('opponentReportAttackZone')}`, attacker.afterDig.zones, thresholds),
        ...distributionRows(`${t('opponentReportAttackAfterDig')} · ${t('opponentReportAttackDirection')}`, attacker.afterDig.directions, thresholds, translateAttackValue),
        ...distributionRows(`${t('opponentReportAttackAfterDig')} · ${t('opponentReportAttackType')}`, attacker.afterDig.types, thresholds, translateAttackValue),
        ...distributionRows(`${t('opponentReportAttackEvaluationBang')} · ${t('opponentReportAttackType')}`, attacker.evaluationBang.types, thresholds, translateAttackValue),
        ...distributionRows(`${t('opponentReportAttackEvaluationMinus')} · ${t('opponentReportAttackType')}`, attacker.evaluationMinus.types, thresholds, translateAttackValue),
        ...attacker.all.blockers.map((blocker) => [
          plain(t('opponentReportAttackBlockers')),
          plain(String(blocker.blockers)),
          { ...plain(`${blocker.attacks} · ${percent(blocker.efficiency)}`), few: blocker.attacks < thresholds.minSample },
          plain(blocker.matches),
        ]),
      ],
    };
    return {
      player: attacker.player,
      courtSvg: buildAttackerCourtSvg(attacker.directionsForDrawing, t('opponentReportAttackCourtTitle', {
        player: playerLabel(attacker.player),
      })),
      courtSample: t('opponentReportMetricSample', {
        matches: attacker.directionsForDrawingMatches,
        actions: attacker.directionsForDrawing.length,
      }),
      highlights,
      performance,
      distribution,
      notes: report.freeTexts[attackerNotesKey(attacker.player.key)] ?? '',
      videoLink: videoLinks.get(attacker.player.key),
    };
  });
}

function setterDistributionView(
  metrics: AttackingReportMetrics,
  report: OpponentReport,
  thresholds: OpponentReportThresholds,
  t: ViewT,
): ReportView['setter'] {
  const targetLabel = (target: string) => (
    isSideOutDistributionTarget(target) ? t(SIDEOUT_TARGET_TRANSLATION_KEYS[target]) : target
  );
  const rows: ViewCell[][] = metrics.setters.flatMap((setter) => setter.rotations.map((rotation) => [
    plain(playerLabel(setter.player)),
    plain(`P${rotation.rotation}`),
    {
      ...plain(t('opponentReportMetricSample', { matches: rotation.matches, actions: rotation.attempts })),
      few: rotation.attempts < thresholds.minSample,
    },
    {
      ...plain(rotation.predictability === null
        ? '–'
        : `${percent(rotation.predictability)} (${rotation.predictableTarget ?? '–'}: ${rotation.predictableCount}/${rotation.attempts})`),
      ...(rotation.predictability !== null
          ? {
            band: rotation.attempts < thresholds.minSample
              ? undefined
              : trafficBand(1 - rotation.predictability, 'attackKill', thresholds),
            few: rotation.attempts < thresholds.minSample,
          }
          : {}),
    },
    plain(rotation.targets.map((entry) => (
      `${targetLabel(entry.value)} · ${t('opponentReportMetricSample', { matches: entry.matches, actions: entry.count })}`
    )).join(' · ') || '–'),
    plain(rotation.receptionEvaluations.map((entry) => (
      `${entry.value} · ${t('opponentReportMetricSample', { matches: entry.matches, actions: entry.count })}`
    )).join(' · ') || '–'),
    plain(rotation.serveBallTypes.map((entry) => (
      `${['H', 'M', 'Q'].includes(entry.value) ? t(`ballType${entry.value}`) : entry.value} · ${t('opponentReportMetricSample', { matches: entry.matches, actions: entry.count })}`
    )).join(' · ') || '–'),
  ]));
  return {
    distribution: {
      columns: [
        t('opponentReportColPlayer'),
        t('opponentReportColRotation'),
        t('opponentReportColSample'),
        t('opponentReportSetterPredictability'),
        t('opponentReportAttackZones'),
        t('opponentReportReceptionType'),
        t('opponentReportServeBallType'),
      ],
      rows,
    },
    notes: report.freeTexts[SETTER_NOTES_KEY] ?? '',
  };
}

export function buildReportView(
  report: OpponentReport,
  metrics: OpponentReportMetrics,
  suggestions: readonly KeySuggestion[],
  thresholds: OpponentReportThresholds,
  t: ViewT,
  receptionSystem: ReceptionSystemBlock,
  attacking: AttackingReportMetrics,
  videoLinks: ReadonlyMap<string, AttackerVideoLink> = new Map(),
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
    attackers: attackDistributionView(attacking, report, thresholds, t, videoLinks),
    setter: setterDistributionView(attacking, report, thresholds, t),
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

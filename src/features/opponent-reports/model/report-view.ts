/**
 * What the report sheets show, already worded and coloured, shared by the
 * screen and the PDF so both say exactly the same thing. Pure given `t`.
 */
import { reportPriorities, priorityText } from './report-priorities';
import type { OpponentReport } from '@src/domain/opponent-report/types';
import type { CourtPosition } from '@src/domain/common/enums';
import type { ReceptionSystemBlock } from '@src/domain/systems/types';
import {
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_SURFACE_WIDTH,
} from '@src/domain/spatial/types';
import type {
  AttackingReportMetrics,
  AttackPerformance,
  SetterReceptionBandMetrics,
  SetterReportMetrics,
} from './attacking-metrics';
import type { AttackerVideoLink } from './attacker-video-links';
import { buildReceptionFormations, type ReceptionFormation } from './reception-formation';
import { compareReportPlayers, percent, playerLabel, type KeySuggestion } from './report-keys';
import type { AttackOutcome, OpponentReportMetrics, Ratio, ReportPlayer, ServeTarget } from './report-metrics';
import type { ServerReportMetrics, ServingReportMetrics } from './serving-metrics';
import { buildServeHowCourtSvg } from './serve-court';
import { DEFAULT_THRESHOLDS, trafficBand, type OpponentReportThresholds, type TrafficBand, type TrafficMetric } from './traffic-light';

export const SETTER_ROTATION_ORDER = [4, 3, 2, 5, 6, 1] as const;

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
  advice?: Record<string, string>;
  keys: { id?: string; text: string; source: 'confirmed' | 'suggested'; sample?: number; includeInPrint?: boolean }[];
  overview: {
    rotations: ViewTable;
    strengths: string[];
    weaknesses: string[];
    errors: ViewTable;
    breakReaction: ViewTable;
    notes: string;
  };
  reception: {
    summary: string;
    good: string[];
    bad: string[];
    receivers: ViewTable;
    individual?: Array<{ player: ReportPlayer; table: ViewTable; videoLink?: AttackerVideoLink }>;
    firstBall: ViewTable;
    positiveReception: ViewTable;
    serveTargets: string[];
    targets: ServeTarget[];
    /** Reception line-up per rotation on the chosen reception system. */
    formations: Array<{ title: string; formation: ReceptionFormation }>;
    formationSystem: string;
    notes: string;
  };
  serveTargets: {
    recommendations: Array<{ rotation: CourtPosition; text: string }>;
    formations: Array<{ title: string; formation: ReceptionFormation }>;
    notes: string;
  };
  attackers: Array<{
    player: OpponentReportMetrics['attackers'][number]['player'];
    attempts?: number;
    courtSvg: string;
    courtSample: string;
    highlights: ViewTable;
    performance: ViewTable;
    distribution: ViewTable;
    notes: string;
    videoLink?: AttackerVideoLink;
  }>;
  setter: {
    groups: Array<{
      player: ReportPlayer;
      attempts?: number;
      bands: Array<{
        key: 'positive' | 'negative';
        title: string;
        summary?: string;
        players: ReportPlayer[];
        courts: Array<{
          rotation: number;
          svg: string;
          sample: string;
          predictability: ViewCell;
        }>;
      }>;
    }>;
    legend: string;
    notes: string;
  };
  serve: {
    servers: Array<{
      player: ReportPlayer;
      courtSvg: string;
      courtSample: string;
      highlights: ViewTable;
      /** Serves with both start and target zone: without them the court is not drawn. */
      hasDirections: boolean;
      /** One line with whatever was scouted: type, start zone preference, aces, errors, run. */
      textSummary: string;
    }>;
    notes: string;
  };
  minSample: number;
}

/** Textual band markers and a low-sample marker remain legible without colour. */
export function formatViewCell(value: ViewCell): string {
  const marker = value.band === 'green' ? '[+]'
    : value.band === 'yellow' ? '[~]'
      : value.band === 'red' ? '[-]'
        : '';
  return [
    marker,
    value.text,
  ].filter(Boolean).join(' ') + (value.few && value.text !== '–' ? '*' : '');
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
export const SERVE_TARGETS_NOTES_KEY = 'sheet:serve-targets';
export const SETTER_NOTES_KEY = 'sheet:setter';
export const SERVE_NOTES_KEY = 'sheet:serve';
export const attackerNotesKey = (playerKey: string) => `attacker:${playerKey}`;

const SERVE_TYPE_TRANSLATION_KEYS: Record<string, string> = {
  jump_spin: 'opponentReportServeTypeJumpSpin',
  jump_float: 'opponentReportServeTypeJumpFloat',
  float: 'opponentReportServeTypeFloat',
  standing_float: 'opponentReportServeTypeFloat',
  short: 'opponentReportServeTypeShort',
  tactical: 'opponentReportServeTypeTactical',
  other: 'opponentReportAttackTypeOther',
};

/** The keys to print: the kept ones, or the first suggestions when none was kept. */
export function resolveReportKeys(
  report: OpponentReport,
  suggestions: readonly KeySuggestion[],
  t: ViewT,
): ReportView['keys'] {
  return reportPriorities(report, suggestions).map((key) => ({
    id: key.id, text: priorityText(key, t),
    source: key.source === 'custom' ? 'confirmed' : 'suggested',
    sample: key.source === 'auto' ? key.suggestion?.sample : undefined,
    includeInPrint: key.includeInPrint,
  }));
}

export function suggestionText(suggestion: KeySuggestion, t: ViewT): string {
  return t(`opponentKey_${suggestion.kind}`, suggestion.params);
}

function outcomeRow(label: string, outcome: AttackOutcome, thresholds: OpponentReportThresholds): ViewCell[] {
  return [plain(label), plain(outcome.total), rateCell(outcome.kill, 'attackKill', thresholds), rateCell(outcome.sideOut, 'sideOut', thresholds)];
}

interface AttackDirectionSample {
  event: AttackingReportMetrics['attackers'][number]['directionsForDrawing'][number];
  origin: { x: number; y: number };
  target: { x: number; y: number };
  lane: number;
}

function attackDirectionSample(
  event: AttackingReportMetrics['attackers'][number]['directionsForDrawing'][number],
): AttackDirectionSample {
  const mirrorY = event.start.x > 50 || (event.start.x === 50 && event.teamSide === 'away');
  const origin = {
    x: event.start.x,
    y: mirrorY ? 100 - event.start.y : event.start.y,
  };
  const target = {
    x: event.end.x,
    y: mirrorY ? 100 - event.end.y : event.end.y,
  };
  const lane = Math.max(0, Math.min(2, Math.floor(
    ((target.y - SCOUTING_SURFACE_INSET_Y) / SCOUTING_SURFACE_HEIGHT) * 3,
  )));
  return { event, origin, target, lane };
}

export function buildAttackerCourtSvg(
  events: AttackingReportMetrics['attackers'][number]['directionsForDrawing'],
  title: string,
  legend: { fans: string; arrow: string; scoring: string },
): string {
  const width = 270;
  const height = 340;
  const margin = 20;
  const courtWidth = width - margin * 2;
  const attackTop = 16;
  const netY = 76;
  const attackHeight = netY - attackTop;
  const attackLineAbove = Math.round(netY - attackHeight * 0.42);
  const courtTop = netY;
  const courtBottom = 288;
  const courtHeight = courtBottom - courtTop;
  const toCourtX = (value: number) => margin
    + ((value - SCOUTING_SURFACE_INSET_Y) / SCOUTING_SURFACE_HEIGHT) * courtWidth;
  const toOriginY = (value: number) => netY
    - (Math.min(SCOUTING_SURFACE_WIDTH / 2, Math.abs(value - 50)) / (SCOUTING_SURFACE_WIDTH / 2)) * attackHeight;
  const toCourtY = (value: number) => courtTop
    + (Math.min(SCOUTING_SURFACE_WIDTH / 2, Math.abs(value - 50)) / (SCOUTING_SURFACE_WIDTH / 2)) * courtHeight;
  const directions = events.map(attackDirectionSample);
  const lanes = [0, 1, 2].map((lane) => {
    const samples = directions.filter((direction) => direction.lane === lane);
    const kills = samples.filter(({ event }) => event.evaluation === '#');
    const average = (values: number[]) => values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    return {
      lane,
      samples,
      kills,
      preference: directions.length > 0 ? samples.length / directions.length : 0,
      originX: toCourtX(average(samples.map(({ origin }) => origin.y))),
      originY: average(samples.map(({ origin }) => toOriginY(origin.x))),
      targetX: toCourtX(average(samples.map(({ target }) => target.y))),
      targetY: courtTop + (average(samples.map(({ target }) => toCourtY(target.x) - courtTop))),
      killShare: directions.filter(({ event }) => event.evaluation === '#').length > 0
        ? kills.length / directions.filter(({ event }) => event.evaluation === '#').length
        : 0,
    };
  }).filter((lane) => lane.samples.length > 0);
  const preferredLane = [...lanes].sort((left, right) => right.preference - left.preference)[0]?.lane;
  const scoringLane = [...lanes]
    .filter((lane) => lane.kills.length > 0)
    .sort((left, right) => right.kills.length - left.kills.length)[0];
  const fans = lanes.map((lane) => {
    const left = margin + (lane.lane / 3) * courtWidth;
    const right = margin + ((lane.lane + 1) / 3) * courtWidth;
    const fill = lane.lane === preferredLane ? '#dc2626' : '#2563eb';
    const opacity = lane.lane === preferredLane ? 0.3 : 0.12 + lane.preference * 0.25;
    return [
      `<polygon data-direction="${lane.lane + 1}" points="${lane.originX},${lane.originY} ${left},${courtBottom} ${right},${courtBottom}" fill="${fill}" fill-opacity="${opacity}" stroke="${fill}" stroke-opacity="0.55" stroke-width="1"/>`,
      `<circle data-attack-origin="${lane.lane + 1}" cx="${lane.originX}" cy="${lane.originY}" r="3.2" fill="${fill}" stroke="#ffffff" stroke-width="1"/>`,
      `<text x="${(left + right) / 2}" y="${courtBottom - 8}" text-anchor="middle" font-size="10" font-weight="bold" fill="#1f2937">${Math.round(lane.preference * 100)}%</text>`,
    ].join('');
  });
  const arrow = scoringLane
    ? (() => {
      const strokeWidth = 1.8 + scoringLane.killShare * 3.2;
      const markerSize = 4 + scoringLane.killShare * 4;
      return [
        `<defs><marker id="attack-arrow" markerWidth="${markerSize}" markerHeight="${markerSize}" refX="${markerSize - 1}" refY="${markerSize / 2}" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L${markerSize},${markerSize / 2} L0,${markerSize} z" fill="#111827"/></marker></defs>`,
        `<line data-scoring-direction="${scoringLane.lane + 1}" x1="${scoringLane.originX}" y1="${scoringLane.originY}" x2="${scoringLane.targetX}" y2="${scoringLane.targetY}" stroke="#111827" stroke-width="${strokeWidth}" marker-end="url(#attack-arrow)"/>`,
        `<text data-scoring-summary="true" x="${width / 2}" text-anchor="middle" y="${scoringLane.targetY - 5}" font-size="10" font-weight="bold" fill="#111827">${escapeXml(legend.scoring.replace('{{points}}', String(scoringLane.kills.length)).replace('{{share}}', String(Math.round(scoringLane.killShare * 100))))}</text>`,
      ].join('');
    })()
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(title)}</title>`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<rect x="${margin}" y="${attackTop}" width="${courtWidth}" height="${attackHeight}" fill="#f1f5f9" stroke="#64748b" stroke-width="1"/>`,
    `<line x1="${margin}" y1="${attackLineAbove}" x2="${margin + courtWidth}" y2="${attackLineAbove}" stroke="#94a3b8" stroke-dasharray="4 3"/>`,
    `<rect x="${margin}" y="${courtTop}" width="${courtWidth}" height="${courtHeight}" fill="#f8fafc" stroke="#002554" stroke-width="1.5"/>`,
    `<line x1="${margin}" y1="${courtTop + courtHeight / 3}" x2="${margin + courtWidth}" y2="${courtTop + courtHeight / 3}" stroke="#64748b" stroke-dasharray="4 3"/>`,
    `<line x1="${margin}" y1="${netY}" x2="${margin + courtWidth}" y2="${netY}" stroke="#002554" stroke-width="4"/>`,
    ...fans,
    arrow,
    `<rect x="${margin}" y="302" width="10" height="10" fill="#dc2626" fill-opacity="0.8"/>`,
    `<text x="${margin + 15}" y="311" font-size="9" fill="#1f2937">${escapeXml(legend.fans)}</text>`,
    `<line x1="${margin}" y1="327" x2="${margin + 12}" y2="327" stroke="#111827" stroke-width="2.5"/>`,
    `<path d="M${margin + 11} 323 L${margin + 18} 327 L${margin + 11} 331 z" fill="#111827"/>`,
    `<text x="${margin + 19}" y="330" font-size="9" fill="#1f2937">${escapeXml(legend.arrow)}</text>`,
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
      attempts: attacker.all.attacks,
      courtSvg: buildAttackerCourtSvg(
        attacker.directionsForDrawing,
        t('opponentReportAttackCourtTitle', { player: playerLabel(attacker.player) }),
        {
          fans: t('opponentReportAttackFanLegend'),
          arrow: t('opponentReportAttackArrowLegend'),
          scoring: t('opponentReportAttackPointSummary', { points: '{{points}}', share: '{{share}}' }),
        },
      ),
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

const SETTER_ATTACK_ZONE_LAYOUT: ReadonlyArray<{ zone: number; x: number; y: number }> = [
  { zone: 4, x: 18, y: 25 },
  { zone: 3, x: 50, y: 25 },
  { zone: 2, x: 82, y: 25 },
  { zone: 5, x: 18, y: 75 },
  { zone: 6, x: 50, y: 75 },
  { zone: 1, x: 82, y: 75 },
];

function mixColor(from: readonly number[], to: readonly number[], amount: number): string {
  const channels = from.map((value, index) => Math.round(value + (to[index] - value) * amount));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

const PREDICTABILITY_FILL: Record<TrafficBand, string> = {
  green: '#dcfce7',
  yellow: '#fef9c3',
  red: '#fee2e2',
  none: '#f1f5f9',
};

function setterPredictabilityCell(band: SetterReceptionBandMetrics, thresholds: OpponentReportThresholds): ViewCell {
  const maxZoneAttempts = Math.max(0, ...band.zones.map((zone) => zone.attempts));
  const topCount = band.predictability?.count ?? maxZoneAttempts;
  const total = band.predictability?.total ?? band.attempts;
  const rate = total > 0 && topCount > 0 ? topCount / total : null;
  const few = total < thresholds.minSample;
  if (rate === null) return { text: '–', few };
  const traffic: TrafficBand = few
    ? 'none'
    : rate >= 0.6
      ? 'red'
      : rate <= 0.45
        ? 'green'
        : 'yellow';
  return {
    text: `${percent(rate)} (${topCount}/${total})`,
    band: traffic === 'none' ? undefined : traffic,
    few,
  };
}

export function buildSetterRotationCourtSvg(
  rotation: number,
  band: SetterReceptionBandMetrics,
  positivePreference: SetterReceptionBandMetrics,
  preferredPositiveZone: number | null,
  t: ViewT,
  thresholds: OpponentReportThresholds = DEFAULT_THRESHOLDS,
): string {
  const width = 240;
  const height = 270;
  const margin = 14;
  const courtTop = 34;
  const courtBottom = 246;
  const courtWidth = width - margin * 2;
  const courtHeight = courtBottom - courtTop;
  const predictability = setterPredictabilityCell(band, thresholds);
  const badgeFill = PREDICTABILITY_FILL[predictability.band ?? 'none'];
  const badgeText = `${t('opponentReportSetterPredictability')}: ${predictability.text}`;
  const positiveCounts = new Map(positivePreference.zones.map((zone) => [zone.zone, zone.attempts]));
  const maxPositiveCount = Math.max(0, ...positiveCounts.values());
  const zones = SETTER_ATTACK_ZONE_LAYOUT.flatMap((layout) => {
    const zone = band.zones.find((entry) => entry.zone === layout.zone);
    if (!zone) return [];
    const x = margin + (layout.x / 100) * courtWidth;
    const y = courtTop + (layout.y / 100) * courtHeight;
    const positiveCount = positiveCounts.get(layout.zone) ?? 0;
    const intensity = maxPositiveCount > 0 ? positiveCount / maxPositiveCount : 0;
    const fill = layout.zone === preferredPositiveZone
      ? '#16a34a'
      : mixColor([241, 245, 249], [147, 197, 253], intensity);
    const textColor = layout.zone === preferredPositiveZone ? '#ffffff' : '#1f2937';
    const playerLabels = zone.players.map((entry) => entry.player.jersey || entry.player.name || '–');
    const labels = playerLabels.length > 0 ? playerLabels.join(' | ') : '–';
    const distributionRate = band.attempts > 0 ? Math.round((zone.attempts / band.attempts) * 100) : 0;
    const pointRate = band.attempts > 0 ? Math.round((zone.kills / band.attempts) * 100) : 0;
    const distributionLabel = t('opponentReportSetterAttackDistribution', { rate: `${distributionRate}%` });
    const pointLabel = t('opponentReportSetterAttackPointRate', { rate: `${pointRate}%` });
    return [
      `<g data-attack-zone="${layout.zone}">`,
      `<title>${escapeXml(`${t('opponentReportAttackZone')} ${layout.zone}: ${labels}, ${distributionLabel}, ${pointLabel}`)}</title>`,
      `<circle cx="${x}" cy="${y}" r="23" fill="${fill}" stroke="#334155" stroke-width="1"/>`,
      `<text x="${x}" y="${y + 3}" text-anchor="middle" font-size="${playerLabels.length > 1 ? 7 : 9}" font-weight="bold" fill="${textColor}">${escapeXml(labels)}</text>`,
      `<text x="${x}" y="${y + 34}" text-anchor="middle" font-size="9" font-weight="600" fill="#1f2937">${distributionRate}%</text>`,
      `<text x="${x}" y="${y + 44}" text-anchor="middle" font-size="9" fill="#1f2937">${pointRate}%</text>`,
      '</g>',
    ].join('');
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>P${rotation}</title>`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<rect data-predictability-band="${predictability.band ?? 'none'}" x="${margin}" y="6" width="${courtWidth}" height="20" rx="6" fill="${badgeFill}" stroke="#cbd5e1" stroke-width="0.8"/>`,
    `<text x="${width / 2}" y="19" text-anchor="middle" font-size="8.5" font-weight="600" fill="${predictability.few ? '#64748b' : '#1f2937'}"${predictability.few ? ' font-style="italic"' : ''}>${escapeXml(badgeText)}</text>`,
    `<rect x="${margin}" y="${courtTop}" width="${courtWidth}" height="${courtHeight}" fill="#f8fafc" stroke="#002554" stroke-width="1.2"/>`,
    `<line x1="${margin}" y1="${courtTop + courtHeight / 3}" x2="${width - margin}" y2="${courtTop + courtHeight / 3}" stroke="#64748b" stroke-dasharray="3 2"/>`,
    `<line x1="${margin - 5}" y1="${courtTop}" x2="${width - margin + 5}" y2="${courtTop}" stroke="#002554" stroke-width="3"/>`,
    `<rect x="${width / 2 - 20}" y="145" width="40" height="23" rx="8" fill="#fff" stroke="#002554" stroke-width="1"/>`,
    `<text x="${width / 2}" y="161" text-anchor="middle" font-size="13" font-weight="bold" fill="#002554">P${rotation}</text>`,
    ...zones,
    '</svg>',
  ].join('');
}

function setterDistributionView(
  metrics: AttackingReportMetrics,
  report: OpponentReport,
  thresholds: OpponentReportThresholds,
  t: ViewT,
): ReportView['setter'] {
  const groups = metrics.setters.map((setter: SetterReportMetrics) => {
    const bands = (['positive', 'negative'] as const).flatMap((key) => {
      const rotations = setter.rotations;
      if (!rotations.some((rotation) => rotation.positive.attempts + rotation.negative.attempts > 0)) return [];
      const title = t(key === 'positive'
        ? 'opponentReportSetterPositiveBand'
        : 'opponentReportSetterNegativeBand');
      const courts = Array.from({ length: 6 }, (_, index) => {
        const rotationNumber = (index + 1) as CourtPosition;
        const rotation = rotations.find((entry) => entry.rotation === rotationNumber);
        const band = rotation?.[key] ?? { attempts: 0, matches: 0, zones: [] };
        const positive = rotation?.positive ?? { attempts: 0, matches: 0, zones: [] };
        return {
          rotation: rotationNumber,
          svg: buildSetterRotationCourtSvg(
            rotationNumber,
            band,
            positive,
            rotation?.preferredPositiveZone ?? null,
            t,
            thresholds,
          ),
          sample: t('opponentReportSetterCourtSample', {
            matches: band.matches,
            actions: band.attempts,
          }),
          predictability: setterPredictabilityCell(band, thresholds),
        };
      });
      const playersByKey = new Map<string, ReportPlayer>();
      rotations.forEach((rotation) => {
        rotation[key].zones.forEach((zone) => {
          zone.players.forEach(({ player }) => playersByKey.set(player.key, player));
        });
      });
      const players = [...playersByKey.values()]
        .sort(compareReportPlayers);
      const totals = new Map<number, number>();
      let attempts = 0;
      rotations.forEach((rotation) => {
        attempts += rotation[key].attempts;
        rotation[key].zones.forEach((zone) => totals.set(zone.zone, (totals.get(zone.zone) ?? 0) + zone.attempts));
      });
      const summary = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([zone, count]) => `${t('opponentReportAttackZone')} ${zone}: ${percent(attempts ? count / attempts : null)} (${count}/${attempts})`).join(' · ');
      return [{ key, title, players, courts, summary }];
    });
    return { player: setter.player, bands, attempts: setter.rotations.reduce((sum, rotation) => sum + rotation.positive.attempts + rotation.negative.attempts, 0) };
  }).filter((group) => group.bands.length > 0);
  return {
    groups,
    legend: t('opponentReportSetterCourtHelp'),
    notes: report.freeTexts[SETTER_NOTES_KEY] ?? '',
  };
}

function translateServeType(value: string, t: ViewT): string {
  const key = SERVE_TYPE_TRANSLATION_KEYS[value];
  return key ? t(key) : value;
}

export function buildServerCourtSvg(
  server: ServerReportMetrics,
  t: ViewT,
): string {
  return buildServeHowCourtSvg(server, {
    title: t('opponentReportServeCourtTitle', { player: playerLabel(server.player) }),
    stripHeading: (breakdown) => t('serveHowStripHeading', {
      type: breakdown.type ? translateServeType(breakdown.type, t) : t('serveHowTypeUnknown'),
      serves: breakdown.serves,
      errors: percent(breakdown.errors.rate),
      aces: percent(breakdown.aces.rate),
      hard: percent(breakdown.hard.rate),
    }),
    legendHeat: t('serveHowLegendHeat'),
    legendRoutes: t('serveHowLegendRoutes'),
    legendAce: t('serveHowLegendAce'),
    aceLabel: (aces) => t('serveHowAceLabel', { aces }),
    noZones: t('serveHowNoZones'),
  });
}

function serveDistributionView(
  serving: ServingReportMetrics,
  report: OpponentReport,
  thresholds: OpponentReportThresholds,
  t: ViewT,
): ReportView['serve'] {
  const servers = serving.servers.map((server) => {
    const topType = server.types[0];
    const topRoute = server.routes[0];
    const topStart = server.startZones[0];
    const topTarget = server.targetZones[0];
    const routeTotal = server.routes.reduce((sum, entry) => sum + entry.count, 0);
    const targetTotal = server.targetZones.reduce((sum, entry) => sum + entry.count, 0);
    const typeTotal = server.types.reduce((sum, entry) => sum + entry.count, 0);
    const routeText = topRoute
      ? t('opponentReportServeRouteValue', {
        start: topRoute.startZone,
        target: topRoute.targetZone,
        rate: percent(topRoute.share),
        count: topRoute.count,
        total: routeTotal,
      })
      : topStart || topTarget
        ? `${topStart ? `Z${topStart.value}` : '–'} → ${topTarget ? `Z${topTarget.value} (${percent(topTarget.share)})` : '–'}`
        : '–';
    const routeSample = topRoute
      ? t('opponentReportMetricSample', { matches: topRoute.matches, actions: routeTotal })
      : topTarget
        ? t('opponentReportMetricSample', { matches: topTarget.matches, actions: targetTotal })
        : t('opponentReportMetricSample', { matches: server.matches, actions: server.serves });
    const routeFew = (topRoute ? routeTotal : targetTotal) < thresholds.minSample;

    const errCell = rateCell(server.errors, 'directErrors', thresholds);
    const errAndAceCell: ViewCell = {
      text: t('opponentReportServeErrorsAndAcesValue', {
        errors: percent(server.errors.rate),
        errorCount: server.errors.count,
        aces: percent(server.aces.rate),
        aceCount: server.aces.count,
        total: server.serves,
      }),
      band: errCell.band,
      few: errCell.few,
    };

    const runFew = server.turns < thresholds.minSample;
    const runCell: ViewCell = {
      text: server.averageConsecutiveServes !== null
        ? t('opponentReportServeRunAvgValue', {
          avg: server.averageConsecutiveServes.toFixed(2),
          max: server.maxConsecutiveServes,
        })
        : '–',
      few: runFew,
    };

    const highlights: ViewTable = {
      columns: [t('opponentReportColCategory'), t('opponentReportColValue'), t('opponentReportColSample')],
      rows: [
        [
          plain(t('opponentReportServeType')),
          topType
            ? {
              text: `${translateServeType(topType.value, t)} · ${percent(topType.share)} (${topType.count}/${typeTotal})`,
              few: typeTotal < thresholds.minSample,
            }
            : { text: '–', few: true },
          plain(t('opponentReportMetricSample', {
            matches: topType?.matches ?? server.matches,
            actions: typeTotal,
          })),
        ],
        [
          plain(t('opponentReportServeRoute')),
          { text: routeText, few: routeFew },
          plain(routeSample),
        ],
        [
          plain(t('opponentReportServeErrorsAndAces')),
          errAndAceCell,
          plain(t('opponentReportMetricSample', { matches: server.matches, actions: server.serves })),
        ],
        [
          plain(t('opponentReportServeRunAvg')),
          runCell,
          plain(t('opponentReportServeTurnsSample', { matches: server.matches, turns: server.turns, serves: server.serves })),
        ],
      ],
    };

    return {
      player: server.player,
      courtSvg: buildServerCourtSvg(server, t),
      hasDirections: server.routes.length > 0,
      textSummary: [
        playerLabel(server.player),
        ...server.types.slice(0, 2).map((entry) => `${translateServeType(entry.value, t)} ${percent(entry.share)}`),
        ...(server.startZones[0] ? [t('serveHowFromZone', { zone: server.startZones[0].value, share: percent(server.startZones[0].share) })] : []),
        t('serveHowTextFigures', {
          serves: server.serves,
          aces: percent(server.aces.rate),
          errors: percent(server.errors.rate),
          run: server.averageConsecutiveServes !== null ? server.averageConsecutiveServes.toFixed(1) : '–',
        }),
      ].join(' · '),
      courtSample: t('serveHowSummary', {
        serves: server.serves,
        matches: server.matches,
        run: server.averageConsecutiveServes !== null ? server.averageConsecutiveServes.toFixed(1) : '–',
        errors: percent(server.errors.rate),
        aces: percent(server.aces.rate),
        hard: percent(server.positive.total ? (server.positive.count - server.aces.count) / server.positive.total : null),
      }),
      highlights,
    };
  });

  return {
    servers,
    notes: report.freeTexts[SERVE_NOTES_KEY] ?? '',
  };
}

function breakReactionView(
  serving: ServingReportMetrics,
  thresholds: OpponentReportThresholds,
  t: ViewT,
): ViewTable {
  const { afterBreakAttacks, serveAfterBreak } = serving.breakReaction;
  const topAttacker = afterBreakAttacks.attackers[0];
  const attackerFew = afterBreakAttacks.attempts < thresholds.minSample;
  const attackerKillBand = topAttacker && !attackerFew && topAttacker.kill.rate !== null
    ? trafficBand(topAttacker.kill.rate, 'attackKill', thresholds)
    : undefined;
  const attackerCell: ViewCell = topAttacker
    ? {
      text: t('opponentReportBreakReactionAttackerValue', {
        player: playerLabel(topAttacker.player),
        share: percent(topAttacker.share.rate),
        count: topAttacker.attempts,
        total: afterBreakAttacks.attempts,
        kill: percent(topAttacker.kill.rate),
      }),
      band: attackerKillBand === 'none' ? undefined : attackerKillBand,
      few: attackerFew,
    }
    : { text: '–', few: true };

  const topServeType = serveAfterBreak.types[0];
  const topServeZone = serveAfterBreak.targetZones[0];
  const serveFew = serveAfterBreak.serves < thresholds.minSample;
  const serveErrorBand = !serveFew && serveAfterBreak.errors.rate !== null
    ? trafficBand(serveAfterBreak.errors.rate, 'directErrors', thresholds)
    : undefined;
  const serveCell: ViewCell = serveAfterBreak.serves > 0
    ? {
      text: t('opponentReportBreakReactionServeValue', {
        type: topServeType ? `${translateServeType(topServeType.value, t)} (${percent(topServeType.share)})` : '–',
        zone: topServeZone ? `Z${topServeZone.value} (${percent(topServeZone.share)})` : '–',
        errors: percent(serveAfterBreak.errors.rate),
        aces: percent(serveAfterBreak.aces.rate),
      }),
      band: serveErrorBand === 'none' ? undefined : serveErrorBand,
      few: serveFew,
    }
    : { text: '–', few: true };

  return {
    columns: [t('opponentReportColSituation'), t('opponentReportColValue'), t('opponentReportColSample')],
    rows: [
      [
        plain(t('opponentReportBreakReactionAttacker')),
        attackerCell,
        plain(t('opponentReportMetricSample', { matches: afterBreakAttacks.matches, actions: afterBreakAttacks.attempts })),
      ],
      [
        plain(t('opponentReportBreakReactionServe')),
        serveCell,
        plain(t('opponentReportMetricSample', { matches: serveAfterBreak.matches, actions: serveAfterBreak.serves })),
      ],
    ],
  };
}

const EMPTY_SERVING_METRICS: ServingReportMetrics = {
  servers: [],
  breakReaction: {
    afterBreakAttacks: { attempts: 0, matches: 0, attackers: [] },
    serveAfterBreak: {
      serves: 0,
      matches: 0,
      aces: { count: 0, total: 0, rate: null },
      errors: { count: 0, total: 0, rate: null },
      types: [],
      targetZones: [],
    },
  },
};

export function buildReportView(
  report: OpponentReport,
  metrics: OpponentReportMetrics,
  suggestions: readonly KeySuggestion[],
  thresholds: OpponentReportThresholds,
  t: ViewT,
  receptionSystem: ReceptionSystemBlock,
  attacking: AttackingReportMetrics,
  videoLinks: ReadonlyMap<string, AttackerVideoLink> = new Map(),
  serving: ServingReportMetrics = EMPTY_SERVING_METRICS,
  receptionVideoLinks: ReadonlyMap<string, AttackerVideoLink> = new Map(),
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

  const breakReaction = breakReactionView(serving, thresholds, t);
  const serveTargetRecommendations = metrics.serveTargets.map((target) => ({
    rotation: target.rotation,
    text: target.sideOut && target.comparison ? t('opponentKey_receiverSideOut', { rotation: `P${target.rotation}`, player: playerLabel(target.player), rate: percent(target.sideOut.rate), baseline: percent(target.comparison.rate), n: target.sideOut.total, otherN: target.comparison.total }) : t('opponentReportServeTargetLine', {
      rotation: `P${target.rotation}`,
      player: playerLabel(target.player),
      zone: target.zone ?? '–',
      rate: percent(target.positive.rate),
      n: target.positive.total,
      inRotation: target.inRotation.total,
    }),
  }));
  const receptionFormations = buildReceptionFormations(metrics, receptionSystem, thresholds);
  const targetFormations = ([1, 2, 3, 4, 5, 6] as CourtPosition[]).map((rotation) => {
    const existing = receptionFormations.find((formation) => formation.rotation === rotation);
    return existing
      ? {
        title: t('opponentReportFormationTitle', {
          rotation: `P${rotation}`,
          rate: percent(existing.receptionPositive?.rate ?? null),
          n: existing.receptions,
        }),
        formation: existing,
      }
      : {
        title: t('opponentReportFormationTitle', { rotation: `P${rotation}`, rate: '–', n: 0 }),
        formation: {
          rotation,
          receptions: 0,
          receptionPositive: null,
          dots: [],
        },
      };
  });

  const advice: Record<string, string> = {};
  const subjects = [
    ...metrics.receivers.map((row) => ({ player: row.player, skill: 'receive', kinds: ['receiverSideOut'] })),
    ...attacking.attackers.map((row) => ({ player: row.player, skill: 'attack', kinds: ['attackerEfficiencyDrop', 'attackerTip', 'attackerBlockOut', 'mainAttacker'] })),
    ...attacking.setters.map((row) => ({ player: row.player, skill: 'setter', kinds: ['setterContext'] })),
    ...serving.servers.map((row) => ({ player: row.player, skill: 'serve', kinds: ['serverTargetZone'] })),
  ];
  for (const subject of subjects) {
    const suggestion = suggestions.find((entry) => subject.kinds.includes(entry.kind) && entry.params.player === playerLabel(subject.player));
    if (suggestion) advice[`${subject.skill}:${subject.player.key}`] = `${suggestionText(suggestion, t)} (${t('opponentReportKeySample', { n: suggestion.sample })})`;
  }
  return {
    advice,
    keys: resolveReportKeys(report, suggestions, t),
    overview: { rotations, strengths, weaknesses, errors, breakReaction, notes: report.notes },
    reception: {
      summary: t('opponentReportReceptionSummary', {
        positive: percent(metrics.receptionTeam.positive.rate),
        errors: percent(metrics.receptionTeam.errors.rate),
        n: metrics.receptionTeam.positive.total,
      }),
      good,
      bad,
      receivers,
      individual: metrics.receivers.filter((row) => row.receptions > 0).map((row, index) => ({
        player: row.player,
        table: { columns: receivers.columns, rows: [receivers.rows[index]] },
        videoLink: receptionVideoLinks.get(row.player.key),
      })),
      firstBall,
      positiveReception: positiveTable,
      serveTargets: serveTargetRecommendations.map(({ text }) => text),
      targets: metrics.serveTargets,
      formations: receptionFormations.map((formation) => ({
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
    serveTargets: {
      recommendations: serveTargetRecommendations,
      formations: targetFormations,
      notes: report.freeTexts[SERVE_TARGETS_NOTES_KEY] ?? '',
    },
    attackers: attackDistributionView(attacking, report, thresholds, t, videoLinks),
    setter: setterDistributionView(attacking, report, thresholds, t),
    serve: serveDistributionView(serving, report, thresholds, t),
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

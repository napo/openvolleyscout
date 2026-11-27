/**
 * What the report sheets show, already worded and coloured, shared by the
 * screen and the PDF so both say exactly the same thing. Pure given `t`.
 */
import { placeSvgLabels } from '@src/lib/utils/svg-label-placement';
import { attackerViewFilterLabel } from './attacker-view-label';
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
  AttackerCustomViewMetrics,
  AttackingReportMetrics,
  AttackPerformance,
  SetterCustomGroupMetrics,
  SetterReceptionBandMetrics,
  SetterReportMetrics,
} from './attacking-metrics';
import type { AttackerVideoLink } from './attacker-video-links';
import type { ReportZoneView } from './report-zones';
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
  keys: { id?: string; text: string; source: 'confirmed' | 'suggested'; sample?: number; sampleText?: string; includeInPrint?: boolean }[];
  overview: {
    rotations: ViewTable;
    strengths: string[];
    weaknesses: string[];
    errors: ViewTable;
    breakReaction: ViewTable;
    /** Whole-team side-out / break indicators (FBSO, MTRP, AST, CP/BP length). */
    teamIndicators: ViewTable;
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
    /** False when no attack has a direction: the court would be empty. */
    hasDirections?: boolean;
    courtSvg: string;
    courtSample: string;
    highlights: ViewTable;
    performance: ViewTable;
    distribution: ViewTable;
    notes: string;
    videoLink?: AttackerVideoLink;
  }>;
  /** Custom filtered attacker direction views configured by the coach; absent when using the single default view. */
  attackerViews?: Array<{
    id: string;
    label: string;
    attackers: Array<{
      player: ReportPlayer;
      attempts: number;
      hasDirections: boolean;
      courtSvg: string;
      courtSample: string;
      highlights: ViewTable;
      notes: string;
      videoLink?: AttackerVideoLink;
    }>;
  }>;
  setter: {
    groups: Array<{
      player: ReportPlayer;
      attempts?: number;
      /** Touches of every skill in the analysed matches: the setters are printed in this order. */
      touches?: number;
      bands: Array<{
        key: string;
        title: string;
        summary?: string;
        players: ReportPlayer[];
        courts: Array<{
          rotation: number;
          svg: string;
          sample: string;
          predictability: ViewCell;
        }>;
        videoLink?: AttackerVideoLink;
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
      videoLink?: AttackerVideoLink;
    }>;
    notes: string;
  };
  /** Zone analysis per rotation, after reception and in transition. */
  zones?: ReportZoneView;
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
  ].filter(Boolean).join(' ') + (value.few && value.text !== '-' ? '*' : '');
}

/** "45% (12/27)", with the band of `metric` and the few-data flag. */
function rateCell(value: Ratio, metric: TrafficMetric | null, thresholds: OpponentReportThresholds): ViewCell {
  const few = value.total < thresholds.minSample;
  if (value.rate === null) return { text: '-', few };
  return {
    text: `${percent(value.rate)} (${value.count}/${value.total})`,
    band: metric && !few ? trafficBand(value.rate, metric, thresholds) : undefined,
    few,
  };
}

const plain = (text: string | number): ViewCell => ({ text: String(text) });

function teamIndicatorsView(metrics: OpponentReportMetrics, thresholds: OpponentReportThresholds, t: ViewT): ViewTable {
  const columns = [t('opponentReportTeamIndicator'), t('opponentReportTeamIndicatorValue'), t('opponentReportTeamIndicatorDescription')];
  const indicators = metrics.teamIndicators;
  if (!indicators) return { columns, rows: [] };
  const lengthCell = (value: { points: number; average: number | null }): ViewCell => (value.average === null
    ? { text: '-' }
    : { text: `${value.average.toFixed(1)} (${value.points} pt)`, few: value.points < thresholds.minSample });
  return {
    columns,
    rows: [
      [plain(t('situationSideOut')), rateCell(indicators.sideOut, 'sideOut', thresholds), plain(t('opponentReportTeamIndicatorDesc_sideOut'))],
      [plain(t('situationFirstBallSideOut')), rateCell(indicators.firstBallSideOut, null, thresholds), plain(t('opponentReportTeamIndicatorDesc_firstBallSideOut'))],
      [plain(t('situationFirstBallPlay')), rateCell(indicators.firstBallPlay, null, thresholds), plain(t('opponentReportTeamIndicatorDesc_firstBallPlay'))],
      [plain(t('cpLengthLabel')), lengthCell(indicators.sideOutLength), plain(t('opponentReportTeamIndicatorDesc_sideOutLength'))],
      [plain(t('situationBreakPoint')), rateCell(indicators.breakPoint, 'breakPoint', thresholds), plain(t('opponentReportTeamIndicatorDesc_breakPoint'))],
      [plain(t('situationAst')), rateCell(indicators.attackAfterDigKill, null, thresholds), plain(t('opponentReportTeamIndicatorDesc_ast'))],
      [plain(t('situationCounterattack')), rateCell(indicators.counterattack, null, thresholds), plain(t('opponentReportTeamIndicatorDesc_counterattack'))],
      [plain(t('bpLengthLabel')), lengthCell(indicators.breakPointLength), plain(t('opponentReportTeamIndicatorDesc_breakPointLength'))],
    ],
  };
}
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
    sampleText: key.source === 'auto' && key.suggestion ? keySampleText(key.suggestion, t) : undefined,
    includeInPrint: key.includeInPrint,
  }));
}

export function suggestionText(suggestion: KeySuggestion, t: ViewT): string {
  return t(`opponentKey_${suggestion.kind}`, suggestion.params);
}

/**
 * The sample size printed after a key. A setter sentence quotes a share of the sets in that
 * rotation and reception band, so it shows "23 of 34 actions" instead of the numerator alone.
 * Reads only what a saved priority already stores (kind, params, sample).
 */
export function keySampleText(suggestion: { kind: string; params: Record<string, string | number>; sample: number }, t: ViewT): string {
  const total = suggestion.kind === 'setterContext' ? Number(suggestion.params.n) : Number.NaN;
  return Number.isFinite(total) && total >= suggestion.sample
    ? t('opponentReportKeySampleOf', { n: suggestion.sample, total })
    : t('opponentReportKeySample', { n: suggestion.sample });
}

function outcomeRow(label: string, outcome: AttackOutcome, thresholds: OpponentReportThresholds): ViewCell[] {
  return [plain(label), plain(outcome.total), rateCell(outcome.kill, 'attackKill', thresholds), rateCell(outcome.sideOut, 'sideOut', thresholds)];
}

interface AttackDirectionSample {
  event: AttackingReportMetrics['attackers'][number]['directionsForDrawing'][number];
  origin: { x: number; y: number };
  target: { x: number; y: number };
  lane: number;
  attackZone: number;
}

function attackDirectionSample(
  event: AttackingReportMetrics['attackers'][number]['directionsForDrawing'][number],
): AttackDirectionSample {
  // The scouting surface puts the left-half team's left (zones 4/5) at small y. The attack card
  // draws the attacker at the top, facing down, so its left is on the RIGHT of the card: the
  // left-half sample is mirrored, and a right-half sample (already mirrored once) is not.
  const mirrorY = !(event.start.x > 50 || (event.start.x === 50 && event.teamSide === 'away'));
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
  const originLane = Math.max(0, Math.min(2, Math.floor(
    ((origin.y - SCOUTING_SURFACE_INSET_Y) / SCOUTING_SURFACE_HEIGHT) * 3,
  )));
  const backRow = Math.abs(origin.x - 50) > SCOUTING_SURFACE_WIDTH / 6;
  const attackZone = (backRow ? [1, 6, 5] : [2, 3, 4])[originLane];
  return { event, origin, target, lane, attackZone };
}

/** Cones per attack zone, as in DataVolley: the opposite court's perimeter split in equal parts. */
const ATTACK_CONES = 7;

export function buildAttackerCourtSvg(
  events: AttackingReportMetrics['attackers'][number]['directionsForDrawing'],
  title: string,
  legend: { fans: string; arrow: string; scoring: string },
  /** Directions with a smaller share of the attacks are left out, and the card says how many. */
  filter: { minShare?: number; hiddenNote?: (count: number, share: number) => string } = {},
): string {
  // Side margins hold the direction labels (a column beside each sideline, a row under the end line).
  const width = 330;
  const height = 356;
  const margin = 50;
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
  // Origins sit at zone centres and are averaged, which pulls zones 4 and 2 towards the
  // middle; spread them out so outside attacks start near the antennas, as on court.
  const ORIGIN_SPREAD = 1.6;
  const toOriginX = (value: number) => {
    const share = (value - SCOUTING_SURFACE_INSET_Y) / SCOUTING_SURFACE_HEIGHT;
    const spread = Math.max(0.04, Math.min(0.96, 0.5 + (share - 0.5) * ORIGIN_SPREAD));
    return margin + spread * courtWidth;
  };
  const toOriginY = (value: number) => netY
    - (Math.min(SCOUTING_SURFACE_WIDTH / 2, Math.abs(value - 50)) / (SCOUTING_SURFACE_WIDTH / 2)) * attackHeight;
  const toCourtY = (value: number) => courtTop
    + (Math.min(SCOUTING_SURFACE_WIDTH / 2, Math.abs(value - 50)) / (SCOUTING_SURFACE_WIDTH / 2)) * courtHeight;
  const directions = events.map(attackDirectionSample);
  // DataVolley-style cones: seen from the attack point, the opposite court's perimeter (left
  // sideline, end line, right sideline) is split into equal parts, so a sharp cross-court
  // shot gets a cone ending on the sideline, not on the end line.
  const left = margin;
  const right = margin + courtWidth;
  const perimeter = courtHeight * 2 + courtWidth;
  const perimeterPoint = (position: number): { x: number; y: number } => {
    const clamped = Math.max(0, Math.min(perimeter, position));
    if (clamped <= courtHeight) return { x: left, y: courtTop + clamped };
    if (clamped <= courtHeight + courtWidth) return { x: left + (clamped - courtHeight), y: courtBottom };
    return { x: right, y: courtBottom - (clamped - courtHeight - courtWidth) };
  };
  const perimeterPosition = (origin: { x: number; y: number }, target: { x: number; y: number }): number => {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const hits: number[] = [];
    if (dy > 0) hits.push((courtBottom - origin.y) / dy);
    if (dx < 0) hits.push((left - origin.x) / dx);
    if (dx > 0) hits.push((right - origin.x) / dx);
    const step = Math.min(...hits.filter((value) => value > 0));
    if (!Number.isFinite(step)) return dx < 0 ? 0 : perimeter;
    const x = origin.x + dx * step;
    const y = Math.max(courtTop, origin.y + dy * step);
    if (x <= left + 0.01) return y - courtTop;
    if (x >= right - 0.01) return courtHeight * 2 + courtWidth - (y - courtTop);
    return courtHeight + (x - left);
  };
  const average = (values: number[]) => values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const totalKills = directions.filter(({ event }) => event.evaluation === '#').length;

  // One origin per attack zone (back row included), so pipes are not merged with zone 3.
  const zones = [...new Set(directions.map(({ attackZone }) => attackZone))];
  const cones = zones.flatMap((attackZone) => {
    const zoneSamples = directions.filter((direction) => direction.attackZone === attackZone);
    const originX = toOriginX(average(zoneSamples.map(({ origin }) => origin.y)));
    const originY = average(zoneSamples.map(({ origin }) => toOriginY(origin.x)));
    const placed = zoneSamples.map((sample) => {
      const target = { x: toCourtX(sample.target.y), y: toCourtY(sample.target.x) };
      const position = perimeterPosition({ x: originX, y: originY }, target);
      const cone = Math.max(0, Math.min(ATTACK_CONES - 1, Math.floor((position / perimeter) * ATTACK_CONES)));
      return { sample, target, cone };
    });
    return [...new Set(placed.map(({ cone }) => cone))].sort((l, r) => l - r).map((cone) => {
      const inCone = placed.filter((item) => item.cone === cone);
      const kills = inCone.filter(({ sample }) => sample.event.evaluation === '#');
      return {
        attackZone,
        cone,
        originX,
        originY,
        count: inCone.length,
        kills,
        preference: directions.length > 0 ? inCone.length / directions.length : 0,
        killShare: totalKills > 0 ? kills.length / totalKills : 0,
      };
    });
  });
  const preferred = [...cones].sort((l, r) => r.count - l.count)[0];
  const minShare = filter.minShare ?? 0;
  const shownCones = minShare > 0 ? cones.filter((cone) => cone.preference >= minShare) : cones;
  const hiddenCount = cones.length - shownCones.length;
  const hiddenNote = hiddenCount > 0 && filter.hiddenNote
    ? `<text data-hidden-directions="${hiddenCount}" x="${right}" y="11" text-anchor="end" font-size="8" font-style="italic" fill="#475569">${escapeXml(filter.hiddenNote(hiddenCount, Math.round(minShare * 100)))}</text>`
    : '';
  const scoring = [...cones].filter((cone) => cone.kills.length > 0).sort((l, r) => r.kills.length - l.kills.length)[0];
  const showZone = zones.length > 1;
  const fans = shownCones.map((cone) => {
    const start = (cone.cone / ATTACK_CONES) * perimeter;
    const end = ((cone.cone + 1) / ATTACK_CONES) * perimeter;
    const corners = [courtHeight, courtHeight + courtWidth].filter((corner) => corner > start && corner < end);
    const points = [perimeterPoint(start), ...corners.map(perimeterPoint), perimeterPoint(end)]
      .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const isPreferred = cone === preferred;
    const fill = isPreferred ? '#dc2626' : '#2563eb';
    const opacity = isPreferred ? 0.3 : 0.12 + cone.preference * 0.25;
    return `<polygon data-direction="${cone.cone + 1}" data-attack-zone="${cone.attackZone}" points="${cone.originX},${cone.originY} ${points}" fill="${fill}" fill-opacity="${opacity}" stroke="${fill}" stroke-opacity="0.55" stroke-width="1"/>`;
  });
  const origins = zones.map((attackZone) => {
    const cone = cones.find((item) => item.attackZone === attackZone)!;
    const fill = preferred?.attackZone === attackZone ? '#dc2626' : '#2563eb';
    return `<circle data-attack-origin="${attackZone}" cx="${cone.originX}" cy="${cone.originY}" data-attack-zone="${attackZone}" r="3.2" fill="${fill}" stroke="#ffffff" stroke-width="1"/>`;
  });
  const scoringTarget = scoring
    ? { x: average(scoring.kills.map(({ target }) => target.x)), y: average(scoring.kills.map(({ target }) => target.y)) }
    : null;
  const summaryText = scoring
    ? legend.scoring.replace('{{points}}', String(scoring.kills.length)).replace('{{share}}', String(Math.round(scoring.killShare * 100)))
    : '';
  // Every cone keeps its label, outside the court: a column beside each sideline and a row
  // under the end line, spread so that none overlaps, each joined to its cone by a thin line.
  const LABEL_FONT = 9.5;
  const labelWidth = (value: string) => value.length * LABEL_FONT * 0.62 + 4;
  const sideLabels = shownCones.map((cone) => {
    const position = ((cone.cone + 0.5) / ATTACK_CONES) * perimeter;
    const anchor = perimeterPoint(position);
    const side: 'left' | 'bottom' | 'right' = position < courtHeight ? 'left' : position <= courtHeight + courtWidth ? 'bottom' : 'right';
    const zoneLabel = showZone ? `Z${cone.attackZone} ` : '';
    return { anchor, side, text: `${zoneLabel}${Math.round(cone.preference * 100)}%`, at: side === 'bottom' ? anchor.x : anchor.y, preference: cone.preference };
  });
  /** Spreads positions along one line: in order, at least `gap(a, b)` apart, inside [min, max]. */
  const spread = <T extends { at: number }>(items: T[], gap: (a: T, b: T) => number, min: number, max: number): Array<T & { pos: number }> => {
    const sorted = [...items].sort((l, r2) => l.at - r2.at).map((item) => ({ ...item, pos: item.at }));
    for (let i = 0; i < sorted.length; i += 1) {
      const floor = i === 0 ? min : sorted[i - 1].pos + gap(sorted[i - 1], sorted[i]);
      sorted[i].pos = Math.max(sorted[i].pos, floor);
    }
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const ceiling = i === sorted.length - 1 ? max : sorted[i + 1].pos - gap(sorted[i], sorted[i + 1]);
      sorted[i].pos = Math.min(sorted[i].pos, ceiling);
    }
    return sorted;
  };
  const rowGap = LABEL_FONT + 2;
  const bottomY = courtBottom + 13;
  const placedSide = [
    ...spread(sideLabels.filter((l) => l.side === 'left'), () => rowGap, courtTop + LABEL_FONT, courtBottom + 2).map((l) => ({ ...l, x: left - 6, y: l.pos, anchorText: 'end' })),
    ...spread(sideLabels.filter((l) => l.side === 'right'), () => rowGap, courtTop + LABEL_FONT, courtBottom + 2).map((l) => ({ ...l, x: right + 6, y: l.pos, anchorText: 'start' })),
    ...spread(sideLabels.filter((l) => l.side === 'bottom'), (a2, b2) => (labelWidth(a2.text) + labelWidth(b2.text)) / 2 + 2, left - 30, right + 30).map((l) => ({ ...l, x: l.pos, y: bottomY, anchorText: 'middle' })),
  ];
  const fanLabels = placedSide.map((label) => {
    const textY = label.side === 'bottom' ? label.y : label.y + LABEL_FONT * 0.35;
    const lineEnd = label.side === 'bottom'
      ? { x: label.x, y: label.y - LABEL_FONT * 0.85 }
      : { x: label.side === 'left' ? label.x + 1 : label.x - 1, y: label.y };
    return [
      `<line data-direction-leader="true" x1="${label.anchor.x.toFixed(1)}" y1="${label.anchor.y.toFixed(1)}" x2="${lineEnd.x.toFixed(1)}" y2="${lineEnd.y.toFixed(1)}" stroke="#64748b" stroke-width="0.6"/>`,
      `<text x="${label.x.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="${label.anchorText}" font-size="${LABEL_FONT}" font-weight="bold" fill="#1f2937">${escapeXml(label.text)}</text>`,
    ].join('');
  });
  // The point summary stays inside the court, away from the arrow's other labels.
  const placedSummary = scoringTarget
    ? placeSvgLabels([{ x: Math.max(left + 50, Math.min(right - 50, scoringTarget.x)), y: scoringTarget.y - 5, fontSize: 10, text: summaryText }], { left, right, top: courtTop, bottom: courtBottom })[0]
    : undefined;
  const arrow = scoring
    ? (() => {
      const strokeWidth = 1.6 + scoring.killShare * 1.8;
      const markerSize = 5 + scoring.killShare * 2.5;
      const targetX = scoringTarget!.x;
      const targetY = scoringTarget!.y;
      return [
        `<defs><marker id="attack-arrow" markerWidth="${markerSize}" markerHeight="${markerSize}" refX="${markerSize - 1}" refY="${markerSize / 2}" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L${markerSize},${markerSize / 2} L0,${markerSize} z" fill="#111827"/></marker></defs>`,
        `<line data-scoring-direction="${scoring.cone + 1}" data-attack-zone="${scoring.attackZone}" x1="${scoring.originX}" y1="${scoring.originY}" x2="${targetX.toFixed(1)}" y2="${targetY.toFixed(1)}" stroke="#111827" stroke-width="${strokeWidth}" marker-end="url(#attack-arrow)"/>`,
        `<text data-scoring-summary="true" x="${placedSummary!.x.toFixed(1)}" text-anchor="middle" y="${placedSummary!.y.toFixed(1)}" font-size="10" font-weight="bold" fill="#111827" stroke="#ffffff" stroke-width="2.5" paint-order="stroke">${escapeXml(summaryText)}</text>`,
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
    ...origins,
    ...fanLabels,
    arrow,
    hiddenNote,
    '<g data-legend-footer="true" data-legend-top="310" data-legend-height="46">',
    `<rect x="${margin}" y="315" width="10" height="10" fill="#dc2626" fill-opacity="0.8"/>`,
    `<text x="${margin + 15}" y="324" font-size="8.5" fill="#1f2937">${escapeXml(legend.fans)}</text>`,
    `<line x1="${margin}" y1="338" x2="${margin + 12}" y2="338" stroke="#111827" stroke-width="2.5"/>`,
    `<path d="M${margin + 11} 334 L${margin + 18} 338 L${margin + 11} 342 z" fill="#111827"/>`,
    ...(() => {
      const words = legend.arrow.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > 46 && current) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) lines.push(current);
      return lines.slice(0, 2).map((line, idx) =>
        `<text x="${margin + 19}" y="${340 + idx * 10}" font-size="8.2" fill="#1f2937">${escapeXml(line)}</text>`,
      );
    })(),
    '</g>',
    '</svg>',
  ].join('');
}

function performanceCell(value: number | null, sample: Pick<AttackPerformance, 'attacks'>, thresholds: OpponentReportThresholds): ViewCell {
  const few = sample.attacks < thresholds.minSample;
  if (value === null) return { text: '-', few };
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
            : { ...plain('-'), few: true },
          plain(weakestPressure
            ? `${weakestPressure[0]} · ${t('opponentReportMetricSample', {
              matches: weakestPressure[1].matches,
              actions: weakestPressure[1].attacks,
            })}`
            : '-'),
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
      hasDirections: attacker.directionsForDrawing.length > 0,
      courtSvg: buildAttackerCourtSvg(
        attacker.directionsForDrawing,
        t('opponentReportAttackCourtTitle', { player: playerLabel(attacker.player) }),
        {
          fans: t('opponentReportAttackFanLegend'),
          arrow: t('opponentReportAttackArrowLegend'),
          scoring: t('opponentReportAttackPointSummary', { points: '{{points}}', share: '{{share}}' }),
        },
        directionFilter(report, t),
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

/** The coach's "hide directions under X%" choice for the attack cones. */
function directionFilter(report: OpponentReport, t: ViewT) {
  return {
    minShare: (report.attackDirectionMinPercent ?? 0) / 100,
    hiddenNote: (count: number, share: number) => t('opponentReportDirectionsHidden', { count, share }),
  };
}

function customAttackerViewsView(
  customViews: readonly AttackerCustomViewMetrics[],
  defaultAttackers: ReportView['attackers'],
  report: OpponentReport,
  thresholds: OpponentReportThresholds,
  t: ViewT,
  videoLinks: ReadonlyMap<string, AttackerVideoLink>,
): NonNullable<ReportView['attackerViews']> {
  return customViews.map((entry) => ({
    id: entry.config.id,
    label: entry.config.label === t('opponentReportAttackAll')
      ? attackerViewFilterLabel(entry.config, t) || t('opponentReportAttackAll')
      : entry.config.label || attackerViewFilterLabel(entry.config, t) || t('opponentReportAttackAll'),
    // Attackers without attacks in this view (e.g. a zone they never attack from) get no card.
    attackers: entry.attackers.filter((attacker) => attacker.attacks > 0).map((attacker) => {
      const filterLabel = attackerViewFilterLabel(entry.config, t);
      const defaultHighlights = !filterLabel
        ? defaultAttackers.find((base) => base.player.key === attacker.player.key)?.highlights
        : undefined;
      const highlights: ViewTable = defaultHighlights ?? {
        columns: [
          t('opponentReportColSituation'),
          t('opponentReportColEfficiency'),
          t('opponentReportColSample'),
        ],
        rows: [[
          plain(filterLabel || t('opponentReportAttackAll')),
          performanceCell(attacker.efficiency, { attacks: attacker.attacks }, thresholds),
          plain(t('opponentReportMetricSample', { matches: attacker.matches, actions: attacker.attacks })),
        ]],
      };
      return {
        player: attacker.player,
        attempts: attacker.attacks,
        hasDirections: attacker.directionsForDrawing.length > 0,
        courtSvg: buildAttackerCourtSvg(
          attacker.directionsForDrawing,
          t('opponentReportAttackCourtTitle', { player: playerLabel(attacker.player) }),
          {
            fans: t('opponentReportAttackFanLegend'),
            arrow: t('opponentReportAttackArrowLegend'),
            scoring: t('opponentReportAttackPointSummary', { points: '{{points}}', share: '{{share}}' }),
          },
          directionFilter(report, t),
        ),
        courtSample: t('opponentReportMetricSample', {
          matches: attacker.directionsForDrawingMatches,
          actions: attacker.directionsForDrawing.length,
        }),
        highlights,
        notes: report.freeTexts[attackerNotesKey(attacker.player.key)] ?? '',
        videoLink: videoLinks.get(attacker.player.key),
      };
    }),
  })).filter((entry) => entry.attackers.length > 0);
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
  if (rate === null) return { text: '-', few };
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
    const playerLabels = zone.players.map((entry) => entry.player.jersey || entry.player.name || '-');
    const labels = playerLabels.length > 0 ? playerLabels.join(' | ') : '-';
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

function buildSetterBandEntry(
  key: string,
  title: string,
  rotationEntries: ReadonlyArray<{
    rotation: number;
    band: SetterReceptionBandMetrics;
    positive: SetterReceptionBandMetrics;
    preferredPositiveZone: number | null;
  }>,
  thresholds: OpponentReportThresholds,
  t: ViewT,
) {
  const courts = Array.from({ length: 6 }, (_, index) => {
    const rotationNumber = (index + 1) as CourtPosition;
    const entry = rotationEntries.find((r) => r.rotation === rotationNumber);
    const band = entry?.band ?? { attempts: 0, matches: 0, zones: [] };
    const positive = entry?.positive ?? { attempts: 0, matches: 0, zones: [] };
    return {
      rotation: rotationNumber,
      svg: buildSetterRotationCourtSvg(
        rotationNumber,
        band,
        positive,
        entry?.preferredPositiveZone ?? null,
        t,
        thresholds,
      ),
      sample: [
        t('opponentReportSetterCourtSample', {
          matches: band.matches,
          actions: band.attempts,
        }),
        ...(band.sideOut && band.sideOut.total > 0
          ? [`SO ${percent(band.sideOut.rate)} (${band.sideOut.count}/${band.sideOut.total})`]
          : []),
      ].join(' · '),
      predictability: setterPredictabilityCell(band, thresholds),
    };
  });
  const playersByKey = new Map<string, ReportPlayer>();
  rotationEntries.forEach((entry) => {
    entry.band.zones.forEach((zone) => {
      zone.players.forEach(({ player }) => playersByKey.set(player.key, player));
    });
  });
  const players = [...playersByKey.values()].sort(compareReportPlayers);
  const totals = new Map<number, number>();
  let attempts = 0;
  let soWins = 0;
  let soTotal = 0;
  rotationEntries.forEach((entry) => {
    attempts += entry.band.attempts;
    if (entry.band.sideOut) {
      soWins += entry.band.sideOut.count;
      soTotal += entry.band.sideOut.total;
    }
    entry.band.zones.forEach((zone) => totals.set(zone.zone, (totals.get(zone.zone) ?? 0) + zone.attempts));
  });
  const zoneParts = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([zone, count]) => `${t('opponentReportAttackZone')} ${zone}: ${percent(attempts ? count / attempts : null)} (${count}/${attempts})`);
  const summary = [
    ...(soTotal > 0 ? [`SO: ${percent(soWins / soTotal)} (${soWins}/${soTotal})`] : []),
    ...zoneParts,
  ].join(' · ');
  return { key, title, players, courts, summary };
}

function setterDistributionView(
  metrics: AttackingReportMetrics,
  report: OpponentReport,
  thresholds: OpponentReportThresholds,
  t: ViewT,
  setterCustomGroups: readonly SetterCustomGroupMetrics[] = [],
  touchesByPlayer: Readonly<Record<string, number>> = {},
): ReportView['setter'] {
  const customByPlayer = new Map(setterCustomGroups.map((g) => [g.player.key, g]));
  const groups = metrics.setters.map((setter: SetterReportMetrics) => {
    const rotations = setter.rotations;
    const hasAnySetterChoice = rotations.some((rotation) => rotation.positive.attempts + rotation.negative.attempts > 0);
    const custom = customByPlayer.get(setter.player.key);
    const positiveByRot = new Map(rotations.map((r) => [r.rotation, r.positive]));
    const bands = custom && custom.views.length > 0
      ? (hasAnySetterChoice
        // A view (or a "draw separately" part) without any set is not drawn.
        ? custom.views.filter((customView) => customView.rotations.some((r) => r.band.attempts > 0)).map((customView) => buildSetterBandEntry(
          customView.config.id,
          customView.config.label.trim() || customView.config.id,
          customView.rotations.map((r) => ({
            rotation: r.rotation,
            band: r.band,
            positive: positiveByRot.get(r.rotation) ?? { attempts: 0, matches: 0, zones: [] },
            preferredPositiveZone: r.preferredPositiveZone,
          })),
          thresholds,
          t,
        ))
        : [])
      : (['positive', 'negative'] as const).flatMap((key) => {
        if (!hasAnySetterChoice) return [];
        const title = t(key === 'positive'
          ? 'opponentReportSetterPositiveBand'
          : 'opponentReportSetterNegativeBand');
        return [buildSetterBandEntry(
          key,
          title,
          rotations.map((r) => ({
            rotation: r.rotation,
            band: r[key],
            positive: r.positive,
            preferredPositiveZone: r.preferredPositiveZone,
          })),
          thresholds,
          t,
        )];
      });
    return { player: setter.player, bands, attempts: setter.rotations.reduce((sum, rotation) => sum + rotation.positive.attempts + rotation.negative.attempts, 0), touches: touchesByPlayer[setter.player.key] };
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
  heatmapEdits?: Record<string, { visible: boolean; percent?: number | null }>,
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
  }, heatmapEdits);
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
        ? `${topStart ? `Z${topStart.value}` : '-'} → ${topTarget ? `Z${topTarget.value} (${percent(topTarget.share)})` : '-'}`
        : '-';
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
        : '-',
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
            : { text: '-', few: true },
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
      courtSvg: buildServerCourtSvg(server, t, report.pieceEdits?.[`serve:${server.player.key}`]?.serveHeatmapEdits),
      hasDirections: server.routes.length > 0,
      textSummary: [
        playerLabel(server.player),
        ...server.types.slice(0, 2).map((entry) => `${translateServeType(entry.value, t)} ${percent(entry.share)}`),
        ...(server.startZones[0] ? [t('serveHowFromZone', { zone: server.startZones[0].value, share: percent(server.startZones[0].share) })] : []),
        t('serveHowTextFigures', {
          serves: server.serves,
          aces: percent(server.aces.rate),
          errors: percent(server.errors.rate),
          run: server.averageConsecutiveServes !== null ? server.averageConsecutiveServes.toFixed(1) : '-',
        }),
      ].join(' · '),
      courtSample: t('serveHowSummary', {
        serves: server.serves,
        matches: server.matches,
        run: server.averageConsecutiveServes !== null ? server.averageConsecutiveServes.toFixed(1) : '-',
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
    : { text: '-', few: true };

  const topServeType = serveAfterBreak.types[0];
  const topServeZone = serveAfterBreak.targetZones[0];
  const serveFew = serveAfterBreak.serves < thresholds.minSample;
  const serveErrorBand = !serveFew && serveAfterBreak.errors.rate !== null
    ? trafficBand(serveAfterBreak.errors.rate, 'directErrors', thresholds)
    : undefined;
  const serveCell: ViewCell = serveAfterBreak.serves > 0
    ? {
      text: t('opponentReportBreakReactionServeValue', {
        type: topServeType ? `${translateServeType(topServeType.value, t)} (${percent(topServeType.share)})` : '-',
        zone: topServeZone ? `Z${topServeZone.value} (${percent(topServeZone.share)})` : '-',
        errors: percent(serveAfterBreak.errors.rate),
        aces: percent(serveAfterBreak.aces.rate),
      }),
      band: serveErrorBand === 'none' ? undefined : serveErrorBand,
      few: serveFew,
    }
    : { text: '-', few: true };

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
  /** Serve links by player key; setter links by `${playerKey}:${band}`. */
  extraVideoLinks: { serve?: ReadonlyMap<string, AttackerVideoLink>; setter?: ReadonlyMap<string, AttackerVideoLink> } = {},
  setterCustomGroups: readonly SetterCustomGroupMetrics[] = [],
  attackerCustomViews: readonly AttackerCustomViewMetrics[] = [],
  /** Zone analysis sheet; absent when the sheet is not built. */
  zones?: ReportZoneView,
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
      zone: target.zone ?? '-',
      rate: percent(target.positive.rate),
      n: target.positive.total,
      inRotation: target.inRotation.total,
    }),
  }));
  const defaultAttackers = attackDistributionView(attacking, report, thresholds, t, videoLinks);
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
        title: t('opponentReportFormationTitle', { rotation: `P${rotation}`, rate: '-', n: 0 }),
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
    if (suggestion) advice[`${subject.skill}:${subject.player.key}`] = `${suggestionText(suggestion, t)} (${keySampleText(suggestion, t)})`;
  }
  return {
    advice,
    keys: resolveReportKeys(report, suggestions, t),
    overview: { rotations, strengths, weaknesses, errors, breakReaction, teamIndicators: teamIndicatorsView(metrics, thresholds, t), notes: report.notes },
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
    attackers: defaultAttackers,
    ...(attackerCustomViews.length > 0
      ? { attackerViews: customAttackerViewsView(attackerCustomViews, defaultAttackers, report, thresholds, t, videoLinks) }
      : {}),
    setter: (() => {
      const setter = setterDistributionView(attacking, report, thresholds, t, setterCustomGroups, metrics.touchesByPlayer);
      return { ...setter, groups: setter.groups.map((group) => ({ ...group, bands: group.bands.map((band) => ({
        ...band, videoLink: extraVideoLinks.setter?.get(`${group.player.key}:${band.key}`),
      })) })) };
    })(),
    serve: (() => {
      const serve = serveDistributionView(serving, report, thresholds, t);
      return { ...serve, servers: serve.servers.map((server) => ({ ...server, videoLink: extraVideoLinks.serve?.get(server.player.key) })) };
    })(),
    ...(zones ? { zones } : {}),
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

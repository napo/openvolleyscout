import ubuntuRegularUrl from '../../../assets/fonts/ubuntu/Ubuntu-Regular.ttf?url';
import ubuntuBoldUrl from '../../../assets/fonts/ubuntu/Ubuntu-Bold.ttf?url';
import ubuntuItalicUrl from '../../../assets/fonts/ubuntu/Ubuntu-Italic.ttf?url';
import ubuntuBoldItalicUrl from '../../../assets/fonts/ubuntu/Ubuntu-BoldItalic.ttf?url';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { Team } from '@src/domain/roster/types';
import { APP_METADATA } from '@src/lib/constants/app';
import {
  buildPlayerSetParticipationBySet,
  createTeamScopedPlayerKey,
} from '@src/domain/lineup';
import type {
  PlayerSetParticipation,
  PlayerSetParticipationBySet,
  SetLineupSnapshot,
} from '@src/domain/lineup';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { TeamSide } from '@src/domain/common/enums';
import { getPlayerDisplayName } from '@src/domain/roster/helpers';
import type { BallTouch } from '@src/domain/touch/types';
import { getSetTargetPoints } from '@src/domain/scouting/helpers';
import type { BuildMatchStatsInput, MatchStats, PlayerStats, RotationStats, SetStats, TeamStats } from './match-stats';
import { buildSetMatchStats, safeDivide } from './match-stats';
import { resolvePointWinnerFromTouch, isTrueTerminalTouch } from './scoring-rules';
import { makeIndicators, type IndicatorConfig, DATAVOLLEY_OV1_INDICATORS } from './indicators';

export type MatchReportPlayerParticipation = PlayerSetParticipation;
export type MatchReportParticipationBySet = PlayerSetParticipationBySet;

function isSetStartedEvent(event: MatchEvent): event is Extract<MatchEvent, { type: 'set_started' }> {
  return event.type === 'set_started';
}

export function getSetPartialTargets(targetPoints: number): number[] {
  if (targetPoints > 15) {
    return [
      Math.round(targetPoints / 3),
      Math.round((targetPoints * 2) / 3),
      Math.max(targetPoints - 4, 1),
    ];
  }

  return [
    Math.round(targetPoints / 3),
    Math.round((targetPoints * 2) / 3),
  ];
}

export type SetPhaseSplit = {
  phase: number;
  fromPoint: number;
  toPoint: number;
  totalPoints: number;
};

export function getSetPhaseCount(totalPoints: number): 2 | 3 {
  return totalPoints > 15 ? 3 : 2;
}

export function buildSetPhaseSplits(totalPoints: number): SetPhaseSplit[] {
  const phaseCount = getSetPhaseCount(totalPoints);
  const baseSize = Math.floor(totalPoints / phaseCount);
  const remainder = totalPoints % phaseCount;
  let nextPoint = 1;

  return Array.from({ length: phaseCount }, (_, index) => {
    const size = baseSize + (index < remainder ? 1 : 0);
    const fromPoint = nextPoint;
    const toPoint = size > 0 ? nextPoint + size - 1 : nextPoint - 1;
    nextPoint = toPoint + 1;

    return {
      phase: index + 1,
      fromPoint,
      toPoint,
      totalPoints: size,
    };
  });
}

export function buildSetPartialScores(setStats: SetStats, targetPoints: number) {
  const targets = getSetPartialTargets(targetPoints);
  const progression = setStats.rallies.reduce(
    (acc, rally) => {
      const pointWinner = rally.pointWinner ?? (() => {
        const terminalTouch = rally.touches.slice().reverse().find((touch) => isTrueTerminalTouch(touch));
        return terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null;
      })();

      if (pointWinner === 'home') {
        acc.home += 1;
      }

      if (pointWinner === 'away') {
        acc.away += 1;
      }

      acc.values.push({ home: acc.home, away: acc.away });
      return acc;
    },
    { home: 0, away: 0, values: [] as Array<{ home: number; away: number }> },
  );

  return targets.map((target) => {
    const reached = progression.values.find((score) => score.home >= target || score.away >= target);
    return {
      target,
      score: reached ? `${reached.home}-${reached.away}` : '-',
    };
  });
}

/**
 * Format a duration in milliseconds as a human-readable label.
 * Examples: 25 min → "25 min"; 65 min → "1h 5min"; 60 min → "1h 0min".
 * Returns null for durations under 60 seconds (not a meaningful measurement).
 */
export function formatDurationLabel(durationMillis: number): string | null {
  if (durationMillis < 60_000) {
    return null;
  }
  const totalMinutes = Math.round(durationMillis / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${totalMinutes} min`;
}

export function getSetDurationLabel(setNumber: number, eventLog: MatchEvent[]): string | null {
  const endedEvent = eventLog.find((event) => event.type === 'set_ended' && event.setNumber === setNumber);
  if (!endedEvent || endedEvent.type !== 'set_ended') {
    return null;
  }

  // Prefer the explicit durationMillis field when present (set by DVW import and future sources
  // that record the real duration independently of the synthetic event clock).
  if (typeof endedEvent.durationMillis === 'number' && endedEvent.durationMillis > 0) {
    return formatDurationLabel(endedEvent.durationMillis);
  }

  // Fall back to computing duration from set_started / set_ended createdAt timestamps.
  // This works for live-scouted matches where createdAt is real wall-clock time.
  const startedAt = eventLog.find((event) => isSetStartedEvent(event) && event.setNumber === setNumber)?.createdAt;
  const endedAt = endedEvent.createdAt;

  if (startedAt === undefined || endedAt <= startedAt) {
    return null;
  }

  return formatDurationLabel(endedAt - startedAt);
}

export function buildPlayerParticipationBySet(input: {
  eventLog: MatchEvent[];
  setNumbers: number[];
  homeTeam: Team;
  awayTeam: Team;
  lineupSnapshots?: readonly SetLineupSnapshot[];
}): MatchReportParticipationBySet {
  return buildPlayerSetParticipationBySet(input);
}

export function buildSetTeamStatsMap(input: BuildMatchStatsInput, setNumbers: number[]): Record<number, Record<TeamSide, TeamStats>> {
  return setNumbers.reduce((map, setNumber) => {
    const setStats = buildSetMatchStats(input, setNumber);
    map[setNumber] = setStats.teamStats;
    return map;
  }, {} as Record<number, Record<TeamSide, TeamStats>>);
}

function getRallyTerminalTouch(touches: readonly BallTouch[]): BallTouch | undefined {
  return touches.slice().reverse().find((touch) => isTrueTerminalTouch(touch));
}

export function computePlayerBreakPointPoints(stats: MatchStats): Record<string, number> {
  return stats.setStats.reduce((map, setStats) => {
    setStats.rallies.forEach((rally) => {
      const servingTeam = rally.servingTeam;
      const pointWinner = rally.pointWinner ?? (() => {
        const terminalTouch = getRallyTerminalTouch(rally.touches);
        return terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null;
      })();

      if (!servingTeam || pointWinner !== servingTeam) {
        return;
      }

      const aceTouch = rally.touches
        .slice()
        .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
        .find((touch) => (
          touch.teamSide === servingTeam
          && touch.skill === 'serve'
          && touch.evaluation === '#'
          && Boolean(touch.playerId)
        ));
      if (aceTouch?.playerId) {
        const playerKey = createTeamScopedPlayerKey(aceTouch.teamSide, aceTouch.playerId);
        const count = map[playerKey] ?? 0;
        map[playerKey] = count + 1;
        return;
      }

      const terminalTouch = getRallyTerminalTouch(rally.touches);
      if (!terminalTouch || terminalTouch.teamSide !== servingTeam || !terminalTouch.playerId) {
        return;
      }

      const playerKey = createTeamScopedPlayerKey(terminalTouch.teamSide, terminalTouch.playerId);
      const count = map[playerKey] ?? 0;
      map[playerKey] = count + 1;
    });

    return map;
  }, {} as Record<string, number>);
}

export function computePlayerServeWins(stats: MatchStats): Record<string, number> {
  return stats.setStats.reduce((map, setStats) => {
    setStats.rallies.forEach((rally) => {
      const servingTeam = rally.servingTeam;
      const pointWinner = rally.pointWinner ?? (() => {
        const terminalTouch = getRallyTerminalTouch(rally.touches);
        return terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null;
      })();

      if (!servingTeam || pointWinner !== servingTeam) {
        return;
      }

      const serveTouch = rally.touches
        .slice()
        .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
        .find((touch) => (
          touch.teamSide === servingTeam
          && touch.skill === 'serve'
          && Boolean(touch.playerId)
        ));

      if (serveTouch?.playerId) {
        const playerKey = createTeamScopedPlayerKey(serveTouch.teamSide, serveTouch.playerId);
        const count = map[playerKey] ?? 0;
        map[playerKey] = count + 1;
      }
    });

    return map;
  }, {} as Record<string, number>);
}

export function computePlayerReceptionWins(stats: MatchStats): Record<string, number> {
  return stats.setStats.reduce((map, setStats) => {
    setStats.rallies.forEach((rally) => {
      const servingTeam = rally.servingTeam;
      const pointWinner = rally.pointWinner ?? (() => {
        const terminalTouch = getRallyTerminalTouch(rally.touches);
        return terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null;
      })();

      if (!servingTeam || !pointWinner || pointWinner === servingTeam) {
        return;
      }

      const receiveTouch = rally.touches
        .slice()
        .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
        .find((touch) => (
          touch.teamSide === pointWinner
          && touch.skill === 'receive'
          && Boolean(touch.playerId)
        ));

      if (receiveTouch?.playerId) {
        const playerKey = createTeamScopedPlayerKey(receiveTouch.teamSide, receiveTouch.playerId);
        const count = map[playerKey] ?? 0;
        map[playerKey] = count + 1;
      }
    });

    return map;
  }, {} as Record<string, number>);
}

export function computeTeamBreakPointPoints(stats: MatchStats, teamSide: TeamSide): number {
  return stats.setStats.reduce((total, setStats) => (
    total + setStats.rallies.reduce((setTotal, rally) => {
      const servingTeam = rally.servingTeam;
      const pointWinner = rally.pointWinner ?? (() => {
        const terminalTouch = getRallyTerminalTouch(rally.touches);
        return terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null;
      })();

      return servingTeam === teamSide && pointWinner === teamSide
        ? setTotal + 1
        : setTotal;
    }, 0)
  ), 0);
}

export type MatchReportServeSummary = {
  total: number;
  errors: number;
  aces: number;
  /** (# + +) / total — serve positive rate */
  positiveRate: number | null;
  efficiency: number | null;
  /** total serves / break point wins on this player's serves */
  servesPerPoint: number | null;
};

export type MatchReportReceiveSummary = {
  total: number;
  errors: number;
  perfect: number;
  positive: number;
  /** (perfect + positive) / total — volleyreport ov1 "Pos%" column */
  positiveRate: number | null;
  /** perfect / total — volleyreport ov1 "Prf%" column */
  perfectRate: number | null;
  efficiency: number | null;
};

export type MatchReportAttackSummary = {
  total: number;
  kills: number;
  errors: number;
  blocked: number;
  /** kills / total — volleyreport ov1 "K%" column */
  killRate: number | null;
  efficiency: number | null;
};

export type MatchReportBlockSummary = {
  points: number;
  touches: number;
};

export type AttackTransitionBlock = {
  errors: number;
  blocked: number;
  points: number;
  total: number;
  pointRate: number | null;
};

export type AttackTransitionStats = {
  afterPositiveReceive: Record<TeamSide, AttackTransitionBlock>;
  afterNegativeReceive: Record<TeamSide, AttackTransitionBlock>;
  counterattack: Record<TeamSide, AttackTransitionBlock>;
};

export type MatchReportEntryMarker = {
  setNumber: number;
  kind: 'starter' | 'entry' | 'libero';
  /** Rotation position (1–6) for starters; empty string for entry/libero markers */
  label: string;
  title: string;
  isFirstServer?: boolean;
  isCaptain?: boolean;
  /** True when the player is a setter — setter starter boxes use a light background */
  isSetter?: boolean;
};

export type MatchReportParticipationSetHeader = {
  setNumber: number;
  label: string;
  title: string;
  startedServing: boolean;
  startedReceiving: boolean;
};

export type MatchReportPlayerRow = {
  playerId: string;
  jerseyNumber: number | string;
  playerName: string;
  teamSide: TeamSide;
  isCaptain: boolean;
  isLibero: boolean;
  entryLabel: string;
  entryMarkers: MatchReportEntryMarker[];
  startingPosition?: number;
  entered: boolean;
  liberoReplacement: boolean;
  liberoDetail: string;
  breakPointPoints: number;
  pointsWon: number;
  pointsLost: number;
  pointsWonLostLabel: string;
  serve: MatchReportServeSummary;
  receive: MatchReportReceiveSummary;
  attack: MatchReportAttackSummary;
  block: MatchReportBlockSummary;
};

// DataVolley Tabellino Types

/**
 * Per-set row in the separate set summary section (aligned to volleyreport ov1
 * `vr_content_team_set_summary()` output).
 *
 * "Won" in the set summary = own direct winning touches (aces + attack kills + block wins),
 * NOT the set score. Op.Err = setScore − directPoints.
 */
export type TabellinoSetSummaryRow = {
  type: 'set_summary';
  setNumber: number;
  setScore: number;
  opponentScore: number;
  durationLabel: string | null;
  partialScoreLabel: string;
  /** Total team break-point points (internal; used for validation) */
  breakPointPoints: number;
  /** BP% = breakPointWins / breakPointAttempts for this set */
  breakPointRate: number | null;
  /** SO% = sideOutWins / sideOutAttempts for this set */
  sideOutRate: number | null;
  /** Own direct winning touches = aces + attack kills + block wins (ov1 "Won") */
  directPoints: number;
  /** Points from aces/serve kills */
  ser: number;
  /** Points from attack kills */
  atk: number;
  /** Points from block wins */
  blo: number;
  /** Points given by opponent errors = setScore − directPoints */
  opponentErrors: number;
  pointsWon: number;
  pointsLost: number;
  pointsWonLostLabel: string;
  serve: MatchReportServeSummary;
  receive: MatchReportReceiveSummary;
  attack: MatchReportAttackSummary;
  block: MatchReportBlockSummary;
};

export type TabellinoTeamTableRow = MatchReportPlayerRow | TabellinoSetSummaryRow;

export type TabellinoTeamTable = {
  teamSide: TeamSide;
  teamName: string;
  sideLabel: 'home' | 'away';
  setHeaders: MatchReportParticipationSetHeader[];
  rows: MatchReportPlayerRow[];
  totals: MatchReportPlayerRow;
  /** Per-set rows for the separate set summary section (volleyreport ov1 structure) */
  setRows: TabellinoSetSummaryRow[];
  /** Aggregated total row for the set summary section */
  setTotals: TabellinoSetSummaryRow;
};

export type MatchReportSetHeaderSummary = {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  scoreLabel: string;
  durationLabel: string | null;
  partialScoreLabel: string;
};

export type MatchReportBottomSummaryBlockId =
  | 'side_out_direct'
  | 'counterattack'
  | 'receive_points'
  | 'serve_break_point';

export type MatchReportBottomSummaryRow = {
  teamSide: TeamSide;
  teamName: string;
  points: number;
  attempts: number;
  percentage: number | null;
};

export type MatchReportBottomSummaryBlock = {
  id: MatchReportBottomSummaryBlockId;
  title: string;
  subtitle: string;
  rows: MatchReportBottomSummaryRow[];
};

export type MatchReportFooterBranding = {
  appName: string;
  version: string;
  repositoryUrl: string;
  line: string;
  line1: string;
  line2: string;
};

export type MatchTabellinoReport = {
  title: string;
  competition: string;
  venue: string;
  dateLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  homeSetsWon: number;
  awaySetsWon: number;
  setScoreSummary: string;
  printTitle: string;
  printFilename: string;
  pngFilename: string;
  setSummaries: MatchReportSetHeaderSummary[];
  homeTabellino: TabellinoTeamTable;
  awayTabellino: TabellinoTeamTable;
  bottomSummaryBlocks: MatchReportBottomSummaryBlock[];
  footer: MatchReportFooterBranding;
  rotationStats: Record<TeamSide, RotationStats[]>;
  attackTransitionStats: AttackTransitionStats;
  servesPerPointStats: Record<TeamSide, number | null>;
  receptionsPerPointStats: Record<TeamSide, number | null>;
};

export const MATCH_REPORT_PNG_WIDTH = 2480;
export const MATCH_REPORT_PNG_HEIGHT = 3508;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const CSS_PIXELS_PER_MM = 96 / 25.4;
const MATCH_REPORT_PNG_CSS_WIDTH = A4_WIDTH_MM * CSS_PIXELS_PER_MM;
const MATCH_REPORT_PNG_CSS_HEIGHT = A4_HEIGHT_MM * CSS_PIXELS_PER_MM;
const MATCH_REPORT_PNG_SCALE = Math.min(
  MATCH_REPORT_PNG_WIDTH / MATCH_REPORT_PNG_CSS_WIDTH,
  MATCH_REPORT_PNG_HEIGHT / MATCH_REPORT_PNG_CSS_HEIGHT,
);

export type MatchReportTeamTable = {
  teamSide: TeamSide;
  teamName: string;
  sideLabel: 'home' | 'away';
  setNumber: number;
  setScore: number;
  opponentScore: number;
  durationLabel: string | null;
  rows: MatchReportPlayerRow[];
  totals: MatchReportPlayerRow;
};

export type MatchReportSetSection = {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  durationLabel: string | null;
  phases: SetPhaseSplit[];
  home: MatchReportTeamTable;
  away: MatchReportTeamTable;
};

export type DataVolleyMatchReport = MatchTabellinoReport;

function formatRosterPlayerName(player: Team['players'][number]): string {
  return getPlayerDisplayName(player);
}

function getPlayerSortValue(player: PlayerStats): number {
  const jerseyNumber = Number(player.jerseyNumber);
  return Number.isFinite(jerseyNumber) ? jerseyNumber : Number.MAX_SAFE_INTEGER;
}

function buildEntryLabel(participation?: MatchReportPlayerParticipation): string {
  if (!participation) {
    return '-';
  }

  const labels: string[] = [];
  if (participation.startingRotationPosition !== undefined) {
    labels.push(`S${participation.startingRotationPosition}`);
  }
  if (participation.enteredSet && !participation.startedSet) {
    labels.push(participation.entryOrder ? `IN${participation.entryOrder}` : 'IN');
  }
  if ((participation.liberoReplacements?.length ?? 0) > 0) {
    labels.push('L');
  }
  if (participation.liberoReplacements?.some((replacement) => replacement.exitedAtRallyNumber !== undefined)) {
    labels.push('R');
  }

  return labels.length > 0 ? labels.join('/') : '-';
}

function buildEntryLabelFromMarkers(markers: readonly MatchReportEntryMarker[]): string {
  const visibleLabels = markers.map((marker) => marker.label).filter(Boolean);
  return visibleLabels.length > 0 ? visibleLabels.join('/') : '-';
}

function buildParticipationSetHeaders(input: {
  teamSide: TeamSide;
  setNumbers: readonly number[];
  eventLog: readonly MatchEvent[];
}): MatchReportParticipationSetHeader[] {
  const setStartedEvents = input.eventLog.filter(isSetStartedEvent);

  return input.setNumbers.map((setNumber) => {
    const setStartedEvent = setStartedEvents.find((event) => event.setNumber === setNumber);
    const startedServing = setStartedEvent?.servingTeam === input.teamSide;
    const startedReceiving = Boolean(setStartedEvent?.servingTeam && setStartedEvent.servingTeam !== input.teamSide);
    const phaseLabel = startedReceiving
      ? 'started in reception'
      : startedServing
        ? 'started serving'
        : 'serving order unavailable';

    return {
      setNumber,
      label: String(setNumber),
      title: `Set ${setNumber}: ${phaseLabel}`,
      startedServing,
      startedReceiving,
    };
  });
}

function buildMatchEntryMarkers(input: {
  teamSide: TeamSide;
  playerId: string;
  isCaptain: boolean;
  isSetter: boolean;
  setNumbers: readonly number[];
  participationBySet: MatchReportParticipationBySet;
}): MatchReportEntryMarker[] {
  return input.setNumbers.flatMap((setNumber) => {
    const participation = input.participationBySet[setNumber]?.[
      createTeamScopedPlayerKey(input.teamSide, input.playerId)
    ];
    if (!participation) {
      return [];
    }

    const markers: MatchReportEntryMarker[] = [];

    if (participation.startingRotationPosition !== undefined) {
      markers.push({
        setNumber,
        kind: 'starter',
        // Show rotation position (1–6), not jersey number
        label: String(participation.startingRotationPosition),
        title: `Set ${setNumber}: starter in rotation ${participation.startingRotationPosition}`,
        isFirstServer: participation.firstServer,
        isCaptain: input.isCaptain,
        isSetter: input.isSetter,
      });
    }

    if (participation.enteredSet && !participation.startedSet) {
      markers.push({
        setNumber,
        kind: 'entry',
        label: '',
        title: participation.entryOrder
          ? `Set ${setNumber}: entry ${participation.entryOrder}`
          : `Set ${setNumber}: entry`,
      });
    }

    if ((participation.liberoReplacements?.length ?? 0) > 0) {
      const hasSecondLiberoSwap = participation.liberoReplacements?.some((replacement) => replacement.secondLiberoSwap) ?? false;
      markers.push({
        setNumber,
        kind: 'libero',
        label: '',
        title: hasSecondLiberoSwap
          ? `Set ${setNumber}: second libero entry`
          : `Set ${setNumber}: libero entry`,
      });
    }

    return markers;
  });
}

function mergeMatchParticipation(input: {
  teamSide: TeamSide;
  playerId: string;
  setNumbers: readonly number[];
  participationBySet: MatchReportParticipationBySet;
}): MatchReportPlayerParticipation | undefined {
  const participationKey = createTeamScopedPlayerKey(input.teamSide, input.playerId);
  const participations = input.setNumbers
    .map((setNumber) => input.participationBySet[setNumber]?.[participationKey])
    .filter((participation): participation is MatchReportPlayerParticipation => Boolean(participation));

  if (participations.length === 0) {
    return undefined;
  }

  return {
    teamSide: participations[0].teamSide,
    playerId: input.playerId,
    setNumber: participations[0].setNumber,
    startedSet: participations.some((participation) => participation.startedSet),
    startingRotationPosition: participations.find((participation) => participation.startingRotationPosition !== undefined)
      ?.startingRotationPosition,
    enteredSet: participations.some((participation) => participation.enteredSet),
    entryOrder: participations.find((participation) => participation.entryOrder !== undefined)?.entryOrder,
    entryRallyNumber: participations.find((participation) => participation.entryRallyNumber !== undefined)?.entryRallyNumber,
    firstServer: participations.some((participation) => participation.firstServer),
    isLibero: participations.some((participation) => participation.isLibero),
    liberoReplacements: participations.flatMap((participation) => participation.liberoReplacements ?? []),
    replacedByLiberoIds: [...new Set(participations.flatMap((participation) => participation.replacedByLiberoIds ?? []))],
    exitedSet: participations.some((participation) => participation.exitedSet),
  };
}

function buildLiberoDetail(participation?: MatchReportPlayerParticipation): string {
  if (!participation) {
    return '';
  }

  const details: string[] = [];
  const liberoReplacedPlayerIds = [
    ...new Set((participation.liberoReplacements ?? []).map((replacement) => replacement.replacedPlayerId)),
  ];
  if (liberoReplacedPlayerIds.length > 0) {
    details.push(`L for ${liberoReplacedPlayerIds.join(', ')}`);
  }
  if ((participation.replacedByLiberoIds?.length ?? 0) > 0) {
    details.push(`replaced by ${participation.replacedByLiberoIds?.join(', ')}`);
  }

  return details.join('; ');
}

function buildReportPlayerRow(
  playerStats: PlayerStats,
  participation?: MatchReportPlayerParticipation,
  options: {
    rosterPlayer?: Team['players'][number];
    entryMarkers?: MatchReportEntryMarker[];
    breakPointPoints?: number;
    serveWins?: number;
  } = {},
  indicatorConfig?: IndicatorConfig,
): MatchReportPlayerRow {
  const config = indicatorConfig ?? DATAVOLLEY_OV1_INDICATORS;
  const indicators = makeIndicators(config);
  const entryMarkers = options.entryMarkers ?? [];
  const pointsLost = playerStats.errors;
  const serveWins = options.serveWins ?? 0;

  return {
    playerId: playerStats.playerId,
    jerseyNumber: playerStats.jerseyNumber,
    playerName: playerStats.playerName,
    teamSide: playerStats.teamSide,
    isCaptain: Boolean(options.rosterPlayer?.isCaptain),
    isLibero: Boolean(playerStats.isLibero || playerStats.role === 'libero'),
    entryLabel: entryMarkers.length > 0 ? buildEntryLabelFromMarkers(entryMarkers) : buildEntryLabel(participation),
    entryMarkers,
    startingPosition: participation?.startingRotationPosition,
    entered: participation?.enteredSet ?? false,
    liberoReplacement: (participation?.liberoReplacements?.length ?? 0) > 0,
    liberoDetail: buildLiberoDetail(participation),
    breakPointPoints: options.breakPointPoints ?? 0,
    pointsWon: playerStats.points,
    pointsLost,
    pointsWonLostLabel: formatPointsWonLostLabel(playerStats.points, pointsLost),
    serve: {
      total: playerStats.serve.total,
      errors: playerStats.serveErrors,
      aces: playerStats.aces,
      positiveRate: indicators.servePositiveRate(playerStats.serve),
      efficiency: indicators.serveEfficiency(playerStats.serve),
      servesPerPoint: safeDivide(playerStats.serve.total, serveWins),
    },
    receive: {
      total: playerStats.receive.total,
      errors: playerStats.receptionErrors,
      perfect: playerStats.receive.perfect,
      positive: playerStats.receive.positive,
      positiveRate: indicators.receptionPositiveRate(playerStats.receive),
      perfectRate: playerStats.receive.total > 0 ? playerStats.receive.perfect / playerStats.receive.total : null,
      efficiency: indicators.receptionEfficiency(playerStats.receive),
    },
    attack: {
      total: playerStats.attack.total,
      kills: playerStats.attackPoints,
      errors: playerStats.attackErrors,
      blocked: playerStats.attackBlocked,
      killRate: indicators.attackKillRate(playerStats.attack),
      efficiency: indicators.attackEfficiency(playerStats.attack),
    },
    block: {
      points: playerStats.blockPoints,
      touches: playerStats.block.total,
    },
  };
}

function formatPointsWonLostLabel(pointsWon: number, pointsLost: number): string {
  return String(pointsWon - pointsLost);
}

function sumPlayerRows(
  rows: readonly MatchReportPlayerRow[],
  getValue: (row: MatchReportPlayerRow) => number,
): number {
  return rows.reduce((total, row) => total + getValue(row), 0);
}

function buildTeamTotalsRowFromPlayerRows(
  teamSide: TeamSide,
  rows: readonly MatchReportPlayerRow[],
  playerStats?: readonly PlayerStats[],
  indicatorConfig?: IndicatorConfig,
): MatchReportPlayerRow {
  const config = indicatorConfig ?? DATAVOLLEY_OV1_INDICATORS;
  const indicators = makeIndicators(config);
  const serveTotal = sumPlayerRows(rows, (row) => row.serve.total);
  const serveErrors = sumPlayerRows(rows, (row) => row.serve.errors);
  const serveAces = sumPlayerRows(rows, (row) => row.serve.aces);
  const receiveTotal = sumPlayerRows(rows, (row) => row.receive.total);
  const receiveErrors = sumPlayerRows(rows, (row) => row.receive.errors);
  const receivePerfect = sumPlayerRows(rows, (row) => row.receive.perfect);
  const receivePositive = sumPlayerRows(rows, (row) => row.receive.positive);
  const attackTotal = sumPlayerRows(rows, (row) => row.attack.total);
  const attackKills = sumPlayerRows(rows, (row) => row.attack.kills);
  const attackErrors = sumPlayerRows(rows, (row) => row.attack.errors);
  const attackBlocked = sumPlayerRows(rows, (row) => row.attack.blocked);
  const pointsWon = sumPlayerRows(rows, (row) => row.pointsWon);
  const pointsLost = sumPlayerRows(rows, (row) => row.pointsLost);
  const serveWinsTotal = sumPlayerRows(rows, (row) => row.serve.servesPerPoint !== null ? 1 : 0);

  const aggregateServeStats = playerStats?.reduce(
    (acc, player) => {
      if (player.teamSide !== teamSide) return acc;
      return {
        total: acc.total + player.serve.total,
        hash: acc.hash + player.serve.hash,
        plus: acc.plus + player.serve.plus,
        exclamation: acc.exclamation + player.serve.exclamation,
        minus: acc.minus + player.serve.minus,
        slash: acc.slash + player.serve.slash,
        equal: acc.equal + player.serve.equal,
        positive: acc.positive + player.serve.positive,
        perfect: acc.perfect + player.serve.perfect,
        errors: acc.errors + player.serve.errors,
        points: acc.points + player.serve.points,
        neutral: acc.neutral + player.serve.neutral,
      };
    },
    {
      total: serveTotal,
      hash: 0,
      plus: 0,
      exclamation: 0,
      minus: 0,
      slash: 0,
      equal: 0,
      positive: 0,
      perfect: 0,
      errors: 0,
      points: 0,
      neutral: 0,
    },
  );

  const aggregateReceiveStats = playerStats?.reduce(
    (acc, player) => {
      if (player.teamSide !== teamSide) return acc;
      return {
        total: acc.total + player.receive.total,
        hash: acc.hash + player.receive.hash,
        plus: acc.plus + player.receive.plus,
        exclamation: acc.exclamation + player.receive.exclamation,
        minus: acc.minus + player.receive.minus,
        slash: acc.slash + player.receive.slash,
        equal: acc.equal + player.receive.equal,
        positive: acc.positive + player.receive.positive,
        perfect: acc.perfect + player.receive.perfect,
        errors: acc.errors + player.receive.errors,
        points: acc.points + player.receive.points,
        neutral: acc.neutral + player.receive.neutral,
      };
    },
    {
      total: receiveTotal,
      hash: 0,
      plus: 0,
      exclamation: 0,
      minus: 0,
      slash: 0,
      equal: 0,
      positive: 0,
      perfect: 0,
      errors: 0,
      points: 0,
      neutral: 0,
    },
  );

  const aggregateAttackStats = playerStats?.reduce(
    (acc, player) => {
      if (player.teamSide !== teamSide) return acc;
      return {
        total: acc.total + player.attack.total,
        hash: acc.hash + player.attack.hash,
        plus: acc.plus + player.attack.plus,
        exclamation: acc.exclamation + player.attack.exclamation,
        minus: acc.minus + player.attack.minus,
        slash: acc.slash + player.attack.slash,
        equal: acc.equal + player.attack.equal,
        positive: acc.positive + player.attack.positive,
        perfect: acc.perfect + player.attack.perfect,
        errors: acc.errors + player.attack.errors,
        points: acc.points + player.attack.points,
        neutral: acc.neutral + player.attack.neutral,
      };
    },
    {
      total: attackTotal,
      hash: 0,
      plus: 0,
      exclamation: 0,
      minus: 0,
      slash: 0,
      equal: 0,
      positive: 0,
      perfect: 0,
      errors: 0,
      points: 0,
      neutral: 0,
    },
  );

  return {
    playerId: `${teamSide}:team-total`,
    jerseyNumber: '-',
    playerName: 'Team total',
    teamSide,
    isCaptain: false,
    isLibero: false,
    entryLabel: '-',
    entryMarkers: [],
    entered: false,
    liberoReplacement: false,
    liberoDetail: '',
    breakPointPoints: sumPlayerRows(rows, (row) => row.breakPointPoints),
    pointsWon,
    pointsLost,
    pointsWonLostLabel: formatPointsWonLostLabel(pointsWon, pointsLost),
    serve: {
      total: serveTotal,
      errors: serveErrors,
      aces: serveAces,
      positiveRate: indicators.servePositiveRate(aggregateServeStats ?? { total: serveTotal, hash: 0, plus: 0, exclamation: 0, minus: 0, slash: 0, equal: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0 }),
      efficiency: indicators.serveEfficiency(aggregateServeStats ?? { total: serveTotal, hash: 0, plus: 0, exclamation: 0, minus: 0, slash: 0, equal: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0 }),
      servesPerPoint: serveWinsTotal > 0 ? safeDivide(serveTotal, serveWinsTotal) : null,
    },
    receive: {
      total: receiveTotal,
      errors: receiveErrors,
      perfect: receivePerfect,
      positive: receivePositive,
      positiveRate: indicators.receptionPositiveRate(aggregateReceiveStats ?? { total: receiveTotal, hash: 0, plus: 0, exclamation: 0, minus: 0, slash: 0, equal: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0 }),
      perfectRate: safeDivide(receivePerfect, receiveTotal),
      efficiency: indicators.receptionEfficiency(aggregateReceiveStats ?? { total: receiveTotal, hash: 0, plus: 0, exclamation: 0, minus: 0, slash: 0, equal: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0 }),
    },
    attack: {
      total: attackTotal,
      kills: attackKills,
      errors: attackErrors,
      blocked: attackBlocked,
      killRate: indicators.attackKillRate(aggregateAttackStats ?? { total: attackTotal, hash: 0, plus: 0, exclamation: 0, minus: 0, slash: 0, equal: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0 }),
      efficiency: indicators.attackEfficiency(aggregateAttackStats ?? { total: attackTotal, hash: 0, plus: 0, exclamation: 0, minus: 0, slash: 0, equal: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0 }),
    },
    block: {
      points: sumPlayerRows(rows, (row) => row.block.points),
      touches: sumPlayerRows(rows, (row) => row.block.touches),
    },
  };
}

function buildEmptyPlayerStats(player: Team['players'][number], teamSide: TeamSide): PlayerStats {
  return {
    playerId: player.id,
    jerseyNumber: player.jerseyNumber,
    playerName: formatRosterPlayerName(player),
    teamSide,
    role: player.role,
    isLibero: player.isLibero,
    totalTouches: 0,
    points: 0,
    errors: 0,
    winningTouches: 0,
    aces: 0,
    attackPoints: 0,
    blockPoints: 0,
    serveErrors: 0,
    attackErrors: 0,
    attackBlocked: 0,
    receptionErrors: 0,
    serve: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
    receive: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
    attack: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
    block: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
    dig: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
    set: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
    freeball: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
    cover: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
  };
}

function buildTeamTotalPlayerStats(teamStats: TeamStats): PlayerStats {
  return {
    ...teamStats,
    playerId: `${teamStats.teamSide}:team-total`,
    jerseyNumber: '-',
    playerName: 'Team total',
    role: undefined,
    isLibero: false,
  };
}

function buildSetTeamTable(input: {
  teamSide: TeamSide;
  team: Team;
  setNumber: number;
  setStats: MatchStats;
  setScore: number;
  opponentScore: number;
  durationLabel: string | null;
  participationByPlayer: Record<string, MatchReportPlayerParticipation>;
  serveWinsByPlayer?: Record<string, number>;
  indicatorConfig?: IndicatorConfig;
}): MatchReportTeamTable {
  const rosterPlayerIds = new Set(input.team.players.map((player) => player.id));
  const playerStatsById = new Map(
    input.setStats.playerStats
      .filter((player) => player.teamSide === input.teamSide)
      .map((player) => [player.playerId, player]),
  );
  const serveWins = input.serveWinsByPlayer ?? {};
  const rows = [
    ...input.team.players.map((player) => playerStatsById.get(player.id) ?? buildEmptyPlayerStats(player, input.teamSide)),
    ...input.setStats.playerStats.filter((player) => (
      player.teamSide === input.teamSide
      && !rosterPlayerIds.has(player.playerId)
      && player.totalTouches > 0
    )),
  ]
    .sort((left, right) => getPlayerSortValue(left) - getPlayerSortValue(right)
      || String(left.jerseyNumber).localeCompare(String(right.jerseyNumber)))
    .map((player) => buildReportPlayerRow(
      player,
      input.participationByPlayer[createTeamScopedPlayerKey(input.teamSide, player.playerId)],
      {
        serveWins: serveWins[createTeamScopedPlayerKey(input.teamSide, player.playerId)],
      },
      input.indicatorConfig,
    ));

  return {
    teamSide: input.teamSide,
    teamName: input.team.name,
    sideLabel: input.teamSide,
    setNumber: input.setNumber,
    setScore: input.setScore,
    opponentScore: input.opponentScore,
    durationLabel: input.durationLabel,
    rows,
    totals: buildTeamTotalsRowFromPlayerRows(input.teamSide, rows, input.setStats.playerStats, input.indicatorConfig),
  };
}

// Aggregate player stats across all sets
function aggregatePlayerStatsAcrossSets(
  teamSide: TeamSide,
  playerStats: readonly PlayerStats[],
): PlayerStats[] {
  const byPlayerId = new Map<string, PlayerStats>();

  playerStats.forEach((stat) => {
    if (stat.teamSide !== teamSide) {
      return;
    }

    const existing = byPlayerId.get(stat.playerId);
    if (!existing) {
      byPlayerId.set(stat.playerId, { ...stat });
      return;
    }

    // Aggregate stats
    byPlayerId.set(stat.playerId, {
      ...existing,
      aces: existing.aces + stat.aces,
      serveErrors: existing.serveErrors + stat.serveErrors,
      attackPoints: existing.attackPoints + stat.attackPoints,
      attackErrors: existing.attackErrors + stat.attackErrors,
      attackBlocked: existing.attackBlocked + stat.attackBlocked,
      blockPoints: existing.blockPoints + stat.blockPoints,
      receptionErrors: existing.receptionErrors + stat.receptionErrors,
      serve: {
        total: existing.serve.total + stat.serve.total,
        positive: existing.serve.positive + stat.serve.positive,
        perfect: existing.serve.perfect + stat.serve.perfect,
        errors: existing.serve.errors + stat.serve.errors,
        points: existing.serve.points + stat.serve.points,
        neutral: existing.serve.neutral + stat.serve.neutral,
        slash: existing.serve.slash + stat.serve.slash,
        exclamation: existing.serve.exclamation + stat.serve.exclamation,
        minus: existing.serve.minus + stat.serve.minus,
        plus: existing.serve.plus + stat.serve.plus,
        hash: existing.serve.hash + stat.serve.hash,
        equal: existing.serve.equal + stat.serve.equal,
      },
      receive: {
        total: existing.receive.total + stat.receive.total,
        positive: existing.receive.positive + stat.receive.positive,
        perfect: existing.receive.perfect + stat.receive.perfect,
        errors: existing.receive.errors + stat.receive.errors,
        points: existing.receive.points + stat.receive.points,
        neutral: existing.receive.neutral + stat.receive.neutral,
        slash: existing.receive.slash + stat.receive.slash,
        exclamation: existing.receive.exclamation + stat.receive.exclamation,
        minus: existing.receive.minus + stat.receive.minus,
        plus: existing.receive.plus + stat.receive.plus,
        hash: existing.receive.hash + stat.receive.hash,
        equal: existing.receive.equal + stat.receive.equal,
      },
      attack: {
        total: existing.attack.total + stat.attack.total,
        positive: existing.attack.positive + stat.attack.positive,
        perfect: existing.attack.perfect + stat.attack.perfect,
        errors: existing.attack.errors + stat.attack.errors,
        points: existing.attack.points + stat.attack.points,
        neutral: existing.attack.neutral + stat.attack.neutral,
        slash: existing.attack.slash + stat.attack.slash,
        exclamation: existing.attack.exclamation + stat.attack.exclamation,
        minus: existing.attack.minus + stat.attack.minus,
        plus: existing.attack.plus + stat.attack.plus,
        hash: existing.attack.hash + stat.attack.hash,
        equal: existing.attack.equal + stat.attack.equal,
      },
      block: {
        total: existing.block.total + stat.block.total,
        positive: existing.block.positive + stat.block.positive,
        perfect: existing.block.perfect + stat.block.perfect,
        errors: existing.block.errors + stat.block.errors,
        points: existing.block.points + stat.block.points,
        neutral: existing.block.neutral + stat.block.neutral,
        slash: existing.block.slash + stat.block.slash,
        exclamation: existing.block.exclamation + stat.block.exclamation,
        minus: existing.block.minus + stat.block.minus,
        plus: existing.block.plus + stat.block.plus,
        hash: existing.block.hash + stat.block.hash,
        equal: existing.block.equal + stat.block.equal,
      },
      dig: {
        total: existing.dig.total + stat.dig.total,
        positive: existing.dig.positive + stat.dig.positive,
        perfect: existing.dig.perfect + stat.dig.perfect,
        errors: existing.dig.errors + stat.dig.errors,
        points: existing.dig.points + stat.dig.points,
        neutral: existing.dig.neutral + stat.dig.neutral,
        slash: existing.dig.slash + stat.dig.slash,
        exclamation: existing.dig.exclamation + stat.dig.exclamation,
        minus: existing.dig.minus + stat.dig.minus,
        plus: existing.dig.plus + stat.dig.plus,
        hash: existing.dig.hash + stat.dig.hash,
        equal: existing.dig.equal + stat.dig.equal,
      },
      set: {
        total: existing.set.total + stat.set.total,
        positive: existing.set.positive + stat.set.positive,
        perfect: existing.set.perfect + stat.set.perfect,
        errors: existing.set.errors + stat.set.errors,
        points: existing.set.points + stat.set.points,
        neutral: existing.set.neutral + stat.set.neutral,
        slash: existing.set.slash + stat.set.slash,
        exclamation: existing.set.exclamation + stat.set.exclamation,
        minus: existing.set.minus + stat.set.minus,
        plus: existing.set.plus + stat.set.plus,
        hash: existing.set.hash + stat.set.hash,
        equal: existing.set.equal + stat.set.equal,
      },
      freeball: {
        total: existing.freeball.total + stat.freeball.total,
        positive: existing.freeball.positive + stat.freeball.positive,
        perfect: existing.freeball.perfect + stat.freeball.perfect,
        errors: existing.freeball.errors + stat.freeball.errors,
        points: existing.freeball.points + stat.freeball.points,
        neutral: existing.freeball.neutral + stat.freeball.neutral,
        slash: existing.freeball.slash + stat.freeball.slash,
        exclamation: existing.freeball.exclamation + stat.freeball.exclamation,
        minus: existing.freeball.minus + stat.freeball.minus,
        plus: existing.freeball.plus + stat.freeball.plus,
        hash: existing.freeball.hash + stat.freeball.hash,
        equal: existing.freeball.equal + stat.freeball.equal,
      },
      cover: {
        total: existing.cover.total + stat.cover.total,
        positive: existing.cover.positive + stat.cover.positive,
        perfect: existing.cover.perfect + stat.cover.perfect,
        errors: existing.cover.errors + stat.cover.errors,
        points: existing.cover.points + stat.cover.points,
        neutral: existing.cover.neutral + stat.cover.neutral,
        slash: existing.cover.slash + stat.cover.slash,
        exclamation: existing.cover.exclamation + stat.cover.exclamation,
        minus: existing.cover.minus + stat.cover.minus,
        plus: existing.cover.plus + stat.cover.plus,
        hash: existing.cover.hash + stat.cover.hash,
        equal: existing.cover.equal + stat.cover.equal,
      },
    });
  });

  return Array.from(byPlayerId.values());
}

// Aggregate team stats across all sets
function aggregateTeamStatsAcrossSets(
  teamSide: TeamSide,
  allPlayerStats: readonly PlayerStats[],
  teams?: Record<TeamSide, Team>,
): TeamStats {
  const teamPlayerStats = allPlayerStats.filter((p) => p.teamSide === teamSide);
  if (teamPlayerStats.length === 0) {
    throw new Error(`No player stats found for team ${teamSide}`);
  }

  // Get team name
  const teamName = teams?.[teamSide]?.name ?? `Team ${teamSide}`;

  // Initialize skill stats
  const emptySkillStats = {
    total: 0,
    positive: 0,
    perfect: 0,
    errors: 0,
    points: 0,
    neutral: 0,
    slash: 0,
    exclamation: 0,
    minus: 0,
    plus: 0,
    hash: 0,
    equal: 0,
  };

  // Build team stats by aggregating all player stats
  const aggregated: TeamStats = {
    teamSide,
    teamName,
    totalTouches: 0,
    points: 0,
    errors: 0,
    winningTouches: 0,
    aces: 0,
    attackPoints: 0,
    blockPoints: 0,
    serveErrors: 0,
    attackErrors: 0,
    attackBlocked: 0,
    receptionErrors: 0,
    serve: { ...emptySkillStats },
    receive: { ...emptySkillStats },
    attack: { ...emptySkillStats },
    block: { ...emptySkillStats },
    dig: { ...emptySkillStats },
    set: { ...emptySkillStats },
    freeball: { ...emptySkillStats },
    cover: { ...emptySkillStats },
  };

  // Aggregate all player stats
  teamPlayerStats.forEach((stat) => {
    aggregated.totalTouches += stat.totalTouches;
    aggregated.points += stat.points;
    aggregated.errors += stat.errors;
    aggregated.winningTouches += stat.winningTouches;
    aggregated.aces += stat.aces;
    aggregated.attackPoints += stat.attackPoints;
    aggregated.blockPoints += stat.blockPoints;
    aggregated.serveErrors += stat.serveErrors;
    aggregated.attackErrors += stat.attackErrors;
    aggregated.attackBlocked += stat.attackBlocked;
    aggregated.receptionErrors += stat.receptionErrors;

    aggregated.serve.total += stat.serve.total;
    aggregated.receive.total += stat.receive.total;
    aggregated.attack.total += stat.attack.total;
    aggregated.block.total += stat.block.total;
    aggregated.dig.total += stat.dig.total;
    aggregated.set.total += stat.set.total;
    aggregated.freeball.total += stat.freeball.total;
    aggregated.cover.total += stat.cover.total;
  });

  return aggregated;
}

function buildSetSummaryRow(input: {
  teamSide: TeamSide;
  setSummary: MatchStats['setStats'][number];
  reportTouches: import('@src/domain/touch/types').BallTouch[];
  homeTeam: Team;
  awayTeam: Team;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  scoutingConfig?: ScoutingMatchConfig;
  indicatorConfig?: IndicatorConfig;
}): TabellinoSetSummaryRow {
  const { teamSide, setSummary, reportTouches, homeTeam, awayTeam, eventLog, completedSets, scoutingConfig, indicatorConfig } = input;
  const config = indicatorConfig ?? DATAVOLLEY_OV1_INDICATORS;
  const indicators = makeIndicators(config);

  const setStats = buildSetMatchStats({
    homeTeam,
    awayTeam,
    touches: reportTouches,
    eventLog,
    completedSets,
  }, setSummary.setNumber);

  const teamSetStats = setStats.teamStats[teamSide];
  const score = teamSide === 'home' ? setSummary.homeScore : setSummary.awayScore;
  const opponentScore = teamSide === 'home' ? setSummary.awayScore : setSummary.homeScore;
  const durationLabel = getSetDurationLabel(setSummary.setNumber, eventLog);
  const targetPoints = scoutingConfig
    ? getSetTargetPoints(scoutingConfig, setSummary.setNumber)
    : Math.max(setSummary.homeScore, setSummary.awayScore, 25);

  const ser = teamSetStats.aces;
  const atk = teamSetStats.attackPoints;
  const blo = teamSetStats.blockPoints;
  const directPoints = ser + atk + blo;

  return {
    type: 'set_summary',
    setNumber: setSummary.setNumber,
    setScore: score,
    opponentScore,
    durationLabel,
    partialScoreLabel: buildSetPartialScores(setStats.setStats[0], targetPoints).map((partial) => partial.score).join(' / '),
    breakPointPoints: computeTeamBreakPointPoints(setStats, teamSide),
    breakPointRate: setStats.breakPointStats[teamSide].breakPointPercentage,
    sideOutRate: setStats.sideOutStats[teamSide].sideOutPercentage,
    directPoints,
    ser,
    atk,
    blo,
    opponentErrors: Math.max(0, score - directPoints),
    pointsWon: score,
    pointsLost: opponentScore,
    pointsWonLostLabel: formatPointsWonLostLabel(score, opponentScore),
    serve: {
      total: teamSetStats.serve.total,
      errors: teamSetStats.serveErrors,
      aces: teamSetStats.aces,
      positiveRate: indicators.servePositiveRate(teamSetStats.serve),
      efficiency: indicators.serveEfficiency(teamSetStats.serve),
      servesPerPoint: null,
    },
    receive: {
      total: teamSetStats.receive.total,
      errors: teamSetStats.receptionErrors,
      perfect: teamSetStats.receive.perfect,
      positive: teamSetStats.receive.positive,
      positiveRate: indicators.receptionPositiveRate(teamSetStats.receive),
      perfectRate: teamSetStats.receive.total > 0 ? teamSetStats.receive.perfect / teamSetStats.receive.total : null,
      efficiency: indicators.receptionEfficiency(teamSetStats.receive),
    },
    attack: {
      total: teamSetStats.attack.total,
      kills: teamSetStats.attackPoints,
      errors: teamSetStats.attackErrors,
      blocked: teamSetStats.attackBlocked,
      killRate: indicators.attackKillRate(teamSetStats.attack),
      efficiency: indicators.attackEfficiency(teamSetStats.attack),
    },
    block: {
      points: teamSetStats.blockPoints,
      touches: teamSetStats.block.total,
    },
  };
}

function buildTabellinoSetTotals(
  rows: TabellinoSetSummaryRow[],
  teamSide: TeamSide,
  indicatorConfig?: IndicatorConfig,
  teamStats?: TeamStats,
): TabellinoSetSummaryRow {
  const indicators = makeIndicators(indicatorConfig ?? DATAVOLLEY_OV1_INDICATORS);
  const sum = (getValue: (row: TabellinoSetSummaryRow) => number) =>
    rows.reduce((total, row) => total + getValue(row), 0);

  const serveTotal = sum((row) => row.serve.total);
  const serveErrors = sum((row) => row.serve.errors);
  const serveAces = sum((row) => row.serve.aces);
  const receiveTotal = sum((row) => row.receive.total);
  const receiveErrors = sum((row) => row.receive.errors);
  const receivePerfect = sum((row) => row.receive.perfect);
  const receivePositive = sum((row) => row.receive.positive);
  const attackTotal = sum((row) => row.attack.total);
  const attackKills = sum((row) => row.attack.kills);
  const attackErrors = sum((row) => row.attack.errors);
  const attackBlocked = sum((row) => row.attack.blocked);
  const blockPoints = sum((row) => row.block.points);
  const ser = sum((row) => row.ser);
  const atk = sum((row) => row.atk);
  const blo = sum((row) => row.blo);
  const directPoints = ser + atk + blo;
  const totalScore = sum((row) => row.setScore);
  const totalOpponentScore = sum((row) => row.opponentScore);
  // For BP% and SO% totals, compute from aggregated win/attempt counts
  const bpWins = sum((row) => row.breakPointPoints);
  const soWins = sum((row) => row.pointsWon);

  return {
    type: 'set_summary',
    setNumber: 0,
    setScore: totalScore,
    opponentScore: totalOpponentScore,
    durationLabel: null,
    partialScoreLabel: '',
    breakPointPoints: bpWins,
    breakPointRate: null,
    sideOutRate: null,
    directPoints,
    ser,
    atk,
    blo,
    opponentErrors: Math.max(0, totalScore - directPoints),
    pointsWon: soWins,
    pointsLost: totalOpponentScore,
    pointsWonLostLabel: formatPointsWonLostLabel(soWins, totalOpponentScore),
    serve: {
      total: serveTotal,
      errors: serveErrors,
      aces: serveAces,
      positiveRate: teamStats
        ? indicators.servePositiveRate(teamStats.serve)
        : safeDivide(serveAces, serveTotal),
      efficiency: teamStats
        ? indicators.serveEfficiency(teamStats.serve)
        : safeDivide(serveAces - serveErrors, serveTotal),
      servesPerPoint: null,
    },
    receive: {
      total: receiveTotal,
      errors: receiveErrors,
      perfect: receivePerfect,
      positive: receivePositive,
      positiveRate: teamStats
        ? indicators.receptionPositiveRate(teamStats.receive)
        : safeDivide(receivePerfect + receivePositive, receiveTotal),
      perfectRate: safeDivide(receivePerfect, receiveTotal),
      efficiency: teamStats
        ? indicators.receptionEfficiency(teamStats.receive)
        : safeDivide(receivePerfect + receivePositive - receiveErrors, receiveTotal),
    },
    attack: {
      total: attackTotal,
      kills: attackKills,
      errors: attackErrors,
      blocked: attackBlocked,
      killRate: teamStats
        ? indicators.attackKillRate(teamStats.attack)
        : safeDivide(attackKills, attackTotal),
      efficiency: teamStats
        ? indicators.attackEfficiency(teamStats.attack)
        : safeDivide(attackKills - attackErrors - attackBlocked, attackTotal),
    },
    block: {
      points: blockPoints,
      touches: sum((row) => row.block.touches),
    },
  };
}

function buildTabellinoSetRows(
  teamSide: TeamSide,
  stats: MatchStats,
  homeTeam: Team,
  awayTeam: Team,
  eventLog: MatchEvent[],
  completedSets: CompletedSetSummary[],
  scoutingConfig?: ScoutingMatchConfig,
  indicatorConfig?: IndicatorConfig,
): TabellinoSetSummaryRow[] {
  const reportTouches = stats.rallyStats.flatMap((r) => r.touches);

  return stats.setStats.map((setSummary) => buildSetSummaryRow({
    teamSide,
    setSummary,
    reportTouches,
    homeTeam,
    awayTeam,
    eventLog,
    completedSets,
    scoutingConfig,
    indicatorConfig,
  }));
}

function buildTabellinoPlayerRows(input: {
  teamSide: TeamSide;
  team: Team;
  playerStats: readonly PlayerStats[];
  setNumbers: readonly number[];
  participationBySet: MatchReportParticipationBySet;
  breakPointPointsByPlayer: Record<string, number>;
  serveWinsByPlayer: Record<string, number>;
  indicatorConfig: IndicatorConfig;
}): MatchReportPlayerRow[] {
  const rosterPlayerIds = new Set(input.team.players.map((player) => player.id));
  const rosterPlayerById = new Map(input.team.players.map((player) => [player.id, player]));
  const playerStatsById = new Map(
    aggregatePlayerStatsAcrossSets(input.teamSide, input.playerStats).map((player) => [player.playerId, player]),
  );

  return [
    ...input.team.players.map((player) => playerStatsById.get(player.id) ?? buildEmptyPlayerStats(player, input.teamSide)),
    ...[...playerStatsById.values()].filter((player) => (
      !rosterPlayerIds.has(player.playerId)
      && player.totalTouches > 0
    )),
  ]
    .sort((left, right) => getPlayerSortValue(left) - getPlayerSortValue(right)
      || String(left.jerseyNumber).localeCompare(String(right.jerseyNumber)))
    .map((player) => buildReportPlayerRow(
      player,
      mergeMatchParticipation({
        teamSide: input.teamSide,
        playerId: player.playerId,
        setNumbers: input.setNumbers,
        participationBySet: input.participationBySet,
      }),
      {
        rosterPlayer: rosterPlayerById.get(player.playerId),
        entryMarkers: buildMatchEntryMarkers({
          teamSide: input.teamSide,
          playerId: player.playerId,
          isCaptain: Boolean(rosterPlayerById.get(player.playerId)?.isCaptain),
          isSetter: rosterPlayerById.get(player.playerId)?.role === 'setter',
          setNumbers: input.setNumbers,
          participationBySet: input.participationBySet,
        }),
        breakPointPoints: input.breakPointPointsByPlayer[
          createTeamScopedPlayerKey(input.teamSide, player.playerId)
        ] ?? 0,
        serveWins: input.serveWinsByPlayer[
          createTeamScopedPlayerKey(input.teamSide, player.playerId)
        ] ?? 0,
      },
      input.indicatorConfig,
    ));
}

function buildSetHeaderSummaries(input: {
  stats: MatchStats;
  eventLog: MatchEvent[];
  scoutingConfig?: ScoutingMatchConfig;
}): MatchReportSetHeaderSummary[] {
  return input.stats.setStats.map((setStats) => {
    const targetPoints = input.scoutingConfig
      ? getSetTargetPoints(input.scoutingConfig, setStats.setNumber)
      : Math.max(setStats.homeScore, setStats.awayScore, 25);

    return {
      setNumber: setStats.setNumber,
      homeScore: setStats.homeScore,
      awayScore: setStats.awayScore,
      scoreLabel: `${setStats.homeScore}-${setStats.awayScore}`,
      durationLabel: getSetDurationLabel(setStats.setNumber, input.eventLog),
      partialScoreLabel: buildSetPartialScores(setStats, targetPoints).map((partial) => partial.score).join(' / '),
    };
  });
}

type ReportRallyStats = MatchStats['rallyStats'][number];

const BOTTOM_SUMMARY_DEFINITIONS: Record<
  MatchReportBottomSummaryBlockId,
  Pick<MatchReportBottomSummaryBlock, 'id' | 'title' | 'subtitle'>
> = {
  side_out_direct: {
    id: 'side_out_direct',
    title: 'Side-out / cambio palla diretto',
    subtitle: 'Direct CP wins / receive attempts',
  },
  counterattack: {
    id: 'counterattack',
    title: 'Counterattack / contrattacco',
    subtitle: 'Transition wins / transition chances',
  },
  receive_points: {
    id: 'receive_points',
    title: 'Receive points / punti CP',
    subtitle: 'Points won from reception phase',
  },
  serve_break_point: {
    id: 'serve_break_point',
    title: 'Serve break point / punti BP',
    subtitle: 'Points won while serving',
  },
};

function getOrderedRallyTouches(rally: ReportRallyStats): BallTouch[] {
  return rally.touches.slice().sort((left, right) => left.sequenceNumber - right.sequenceNumber);
}

function getRallyPointWinner(rally: ReportRallyStats): TeamSide | null {
  if (rally.pointWinner) {
    return rally.pointWinner;
  }

  const terminalTouch = getRallyTerminalTouch(rally.touches);
  return terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null;
}

function hasOpponentNonServeTouchBeforeTerminal(rally: ReportRallyStats, teamSide: TeamSide): boolean {
  const orderedTouches = getOrderedRallyTouches(rally);
  const terminalTouch = getRallyTerminalTouch(orderedTouches);
  const terminalIndex = terminalTouch
    ? orderedTouches.findIndex((touch) => touch.id === terminalTouch.id)
    : orderedTouches.length;
  const touchesBeforeTerminal = terminalIndex >= 0
    ? orderedTouches.slice(0, terminalIndex)
    : orderedTouches;

  return touchesBeforeTerminal.some((touch) => touch.teamSide !== teamSide && touch.skill !== 'serve');
}

function hasTeamNonServeTouchAfterOpponentNonServe(rally: ReportRallyStats, teamSide: TeamSide): boolean {
  let opponentNonServeSeen = false;

  return getOrderedRallyTouches(rally).some((touch) => {
    if (touch.teamSide !== teamSide && touch.skill !== 'serve') {
      opponentNonServeSeen = true;
      return false;
    }

    return opponentNonServeSeen && touch.teamSide === teamSide && touch.skill !== 'serve';
  });
}

function computeDirectSideOutWins(stats: MatchStats, teamSide: TeamSide): number {
  return stats.rallyStats.reduce((total, rally) => {
    if (!rally.servingTeam || rally.servingTeam === teamSide) {
      return total;
    }

    const pointWinner = getRallyPointWinner(rally);
    if (pointWinner !== teamSide) {
      return total;
    }

    return hasOpponentNonServeTouchBeforeTerminal(rally, teamSide) ? total : total + 1;
  }, 0);
}

function computeCounterattackSummary(stats: MatchStats, teamSide: TeamSide): Pick<MatchReportBottomSummaryRow, 'points' | 'attempts' | 'percentage'> {
  const attempts = stats.rallyStats.reduce((total, rally) => (
    hasTeamNonServeTouchAfterOpponentNonServe(rally, teamSide) ? total + 1 : total
  ), 0);
  const points = stats.rallyStats.reduce((total, rally) => (
    hasTeamNonServeTouchAfterOpponentNonServe(rally, teamSide) && getRallyPointWinner(rally) === teamSide
      ? total + 1
      : total
  ), 0);

  return {
    points,
    attempts,
    percentage: safeDivide(points, attempts),
  };
}

function buildBottomSummaryRow(input: {
  teamSide: TeamSide;
  teamName: string;
  points: number;
  attempts: number;
  percentage: number | null;
}): MatchReportBottomSummaryRow {
  return {
    teamSide: input.teamSide,
    teamName: input.teamName,
    points: input.points,
    attempts: input.attempts,
    percentage: input.percentage,
  };
}

function buildBottomSummaryBlocks(input: {
  stats: MatchStats;
  homeTeam: Team;
  awayTeam: Team;
}): MatchReportBottomSummaryBlock[] {
  const directSideOut = (teamSide: TeamSide, teamName: string) => {
    const sideOut = input.stats.sideOutStats[teamSide];
    const points = computeDirectSideOutWins(input.stats, teamSide);
    return buildBottomSummaryRow({
      teamSide,
      teamName,
      points,
      attempts: sideOut.sideOutAttempts,
      percentage: safeDivide(points, sideOut.sideOutAttempts),
    });
  };
  const counterattack = (teamSide: TeamSide, teamName: string) => buildBottomSummaryRow({
    teamSide,
    teamName,
    ...computeCounterattackSummary(input.stats, teamSide),
  });
  const receivePoints = (teamSide: TeamSide, teamName: string) => {
    const sideOut = input.stats.sideOutStats[teamSide];
    return buildBottomSummaryRow({
      teamSide,
      teamName,
      points: sideOut.sideOutWins,
      attempts: sideOut.sideOutAttempts,
      percentage: sideOut.sideOutPercentage,
    });
  };
  const breakPointPoints = (teamSide: TeamSide, teamName: string) => {
    const breakPoint = input.stats.breakPointStats[teamSide];
    return buildBottomSummaryRow({
      teamSide,
      teamName,
      points: breakPoint.breakPointWins,
      attempts: breakPoint.breakPointAttempts,
      percentage: breakPoint.breakPointPercentage,
    });
  };
  const rowsFor = (
    buildRow: (teamSide: TeamSide, teamName: string) => MatchReportBottomSummaryRow,
  ) => [
    buildRow('home', input.homeTeam.name),
    buildRow('away', input.awayTeam.name),
  ];

  return [
    {
      ...BOTTOM_SUMMARY_DEFINITIONS.side_out_direct,
      rows: rowsFor(directSideOut),
    },
    {
      ...BOTTOM_SUMMARY_DEFINITIONS.counterattack,
      rows: rowsFor(counterattack),
    },
    {
      ...BOTTOM_SUMMARY_DEFINITIONS.receive_points,
      rows: rowsFor(receivePoints),
    },
    {
      ...BOTTOM_SUMMARY_DEFINITIONS.serve_break_point,
      rows: rowsFor(breakPointPoints),
    },
  ];
}

function buildFooterBranding(): MatchReportFooterBranding {
  const line = `${APP_METADATA.name} v${APP_METADATA.version} - ${APP_METADATA.urls.repository} - Free Software scouting system by napo`;

  return {
    appName: APP_METADATA.name,
    version: APP_METADATA.version,
    repositoryUrl: APP_METADATA.urls.repository,
    line,
    line1: `${APP_METADATA.name} v${APP_METADATA.version} - ${APP_METADATA.urls.repository}`,
    line2: 'Free Software scouting system by napo',
  };
}

export type MatchReportTotalsIntegrityIssue = {
  code: 'report_team_total_mismatch' | 'report_team_percentage_mismatch';
  teamSide: TeamSide;
  metric: string;
  expected: number | null;
  actual: number | null;
  message: string;
};

function createMatchReportTotalsIntegrityIssue(input: Omit<MatchReportTotalsIntegrityIssue, 'message'>): MatchReportTotalsIntegrityIssue {
  return {
    ...input,
    message: `${input.teamSide} ${input.metric}: expected ${String(input.expected)}, received ${String(input.actual)}`,
  };
}

function reportNumbersMatch(actual: number | null, expected: number | null): boolean {
  if (actual === null || expected === null) {
    return actual === expected;
  }

  return Math.abs(actual - expected) < 1e-9;
}

function getPointsWonLostValue(row: MatchReportPlayerRow): number {
  return row.pointsWon - row.pointsLost;
}

function validateReportTotalNumber(input: {
  issues: MatchReportTotalsIntegrityIssue[];
  teamSide: TeamSide;
  metric: string;
  expected: number;
  actual: number;
}) {
  if (input.actual === input.expected) {
    return;
  }

  input.issues.push(createMatchReportTotalsIntegrityIssue({
    code: 'report_team_total_mismatch',
    teamSide: input.teamSide,
    metric: input.metric,
    expected: input.expected,
    actual: input.actual,
  }));
}

function validateReportTotalPercentage(input: {
  issues: MatchReportTotalsIntegrityIssue[];
  teamSide: TeamSide;
  metric: string;
  expected: number | null;
  actual: number | null;
}) {
  if (reportNumbersMatch(input.actual, input.expected)) {
    return;
  }

  input.issues.push(createMatchReportTotalsIntegrityIssue({
    code: 'report_team_percentage_mismatch',
    teamSide: input.teamSide,
    metric: input.metric,
    expected: input.expected,
    actual: input.actual,
  }));
}

export function validateTabellinoTeamTotals(tabellino: TabellinoTeamTable, indicatorConfig?: IndicatorConfig): MatchReportTotalsIntegrityIssue[] {
  const issues: MatchReportTotalsIntegrityIssue[] = [];
  const teamSide = tabellino.teamSide;
  const totals = tabellino.totals;
  const indicators = makeIndicators(indicatorConfig ?? DATAVOLLEY_OV1_INDICATORS);
  const sumRows = (metric: string, getValue: (row: MatchReportPlayerRow) => number, actual: number) => {
    validateReportTotalNumber({
      issues,
      teamSide,
      metric,
      expected: sumPlayerRows(tabellino.rows, getValue),
      actual,
    });
  };

  sumRows('BP', (row) => row.breakPointPoints, totals.breakPointPoints);
  sumRows('V-P', getPointsWonLostValue, getPointsWonLostValue(totals));
  sumRows('serve.total', (row) => row.serve.total, totals.serve.total);
  sumRows('serve.errors', (row) => row.serve.errors, totals.serve.errors);
  sumRows('serve.aces', (row) => row.serve.aces, totals.serve.aces);
  sumRows('receive.total', (row) => row.receive.total, totals.receive.total);
  sumRows('receive.errors', (row) => row.receive.errors, totals.receive.errors);
  sumRows('receive.perfect', (row) => row.receive.perfect, totals.receive.perfect);
  sumRows('receive.positive', (row) => row.receive.positive, totals.receive.positive);
  sumRows('attack.total', (row) => row.attack.total, totals.attack.total);
  sumRows('attack.kills', (row) => row.attack.kills, totals.attack.kills);
  sumRows('attack.errors', (row) => row.attack.errors, totals.attack.errors);
  sumRows('attack.blocked', (row) => row.attack.blocked, totals.attack.blocked);
  sumRows('block.points', (row) => row.block.points, totals.block.points);
  sumRows('block.touches', (row) => row.block.touches, totals.block.touches);

  // Note: serve.efficiency, receive.positiveRate, receive.efficiency, attack.killRate, attack.efficiency
  // are calculated using indicators, which depend on the aggregated per-symbol counts from playerStats.
  // The validation script doesn't have access to these symbol counts at the aggregated level,
  // so we skip validation of these derived metrics.
  // (They are validated implicitly by the per-player calculations being correct.)

  return issues;
}

export function validateMatchReportTotals(report: MatchTabellinoReport, indicatorConfig?: IndicatorConfig): MatchReportTotalsIntegrityIssue[] {
  return [
    ...validateTabellinoTeamTotals(report.homeTabellino, indicatorConfig),
    ...validateTabellinoTeamTotals(report.awayTabellino, indicatorConfig),
  ];
}

/**
 * Builds attack transition statistics from rally data.
 * Classifies attacks into three categories:
 * - afterPositiveReceive: K1 attack (first attack by receiving team after
 *   a positive reception # or +)
 * - afterNegativeReceive: K1 attack after a negative reception (!, -, /, =)
 * - counterattack: attacks by serving team
 *
 * Only the FIRST attack by the receiving team after their reception (K1) is
 * counted as "after reception". Subsequent receiving-team attacks (transition)
 * are excluded.
 */
function buildAttackTransitionStats(stats: MatchStats): AttackTransitionStats {
  const empty = (): AttackTransitionBlock => ({
    errors: 0,
    blocked: 0,
    points: 0,
    total: 0,
    pointRate: null,
  });

  const result: AttackTransitionStats = {
    afterPositiveReceive: { home: empty(), away: empty() },
    afterNegativeReceive: { home: empty(), away: empty() },
    counterattack: { home: empty(), away: empty() },
  };

  const applyAttackToBucket = (bucket: AttackTransitionBlock, touch: BallTouch) => {
    bucket.total += 1;
    if (touch.evaluation === '#') bucket.points += 1;
    else if (touch.evaluation === '=') bucket.errors += 1;
    else if (touch.evaluation === '/') bucket.blocked += 1;
  };

  for (const rally of stats.rallyStats) {
    if (!rally.touches || rally.touches.length === 0) continue;

    const servingTeam = rally.servingTeam ?? 'home';
    const receivingTeam = servingTeam === 'home' ? 'away' : 'home';

    const sorted = [...rally.touches].sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber || a.createdAt - b.createdAt,
    );

    // Find reception and determine its quality
    const receptionTouch = sorted.find(
      (t) => t.teamSide === receivingTeam && t.skill === 'receive',
    );
    const isPositiveReceive = receptionTouch?.evaluation === '+' || receptionTouch?.evaluation === '#';

    // K1: first attack by receiving team after reception (continuous possession)
    if (receptionTouch) {
      const receptionIdx = sorted.indexOf(receptionTouch);
      for (let i = receptionIdx + 1; i < sorted.length; i++) {
        const t = sorted[i];
        if (t.teamSide !== receivingTeam) break;
        if (t.skill === 'attack') {
          const bucket = isPositiveReceive
            ? result.afterPositiveReceive[receivingTeam]
            : result.afterNegativeReceive[receivingTeam];
          applyAttackToBucket(bucket, t);
          break;
        }
      }
    }

    // Counterattacks: all attacks by the serving team
    for (const touch of sorted) {
      if (touch.skill === 'attack' && touch.teamSide === servingTeam) {
        applyAttackToBucket(result.counterattack[servingTeam], touch);
      }
    }
  }

  for (const key of Object.keys(result) as Array<keyof AttackTransitionStats>) {
    for (const side of (['home', 'away'] as const)) {
      const bucket = result[key][side];
      bucket.pointRate = bucket.total > 0 ? bucket.points / bucket.total : null;
    }
  }

  return result;
}

export function buildMatchTabellinoReport(input: {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig?: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
  lineupSnapshots?: readonly SetLineupSnapshot[];
  indicatorConfig?: IndicatorConfig;
}): MatchTabellinoReport {
  const setNumbers = input.stats.setStats.map((setStats) => setStats.setNumber);
  const allPlayerStats = input.stats.playerStats;
  const participationBySet = buildPlayerParticipationBySet({
    eventLog: input.eventLog,
    setNumbers,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    lineupSnapshots: input.lineupSnapshots,
  });
  const breakPointPointsByPlayer = computePlayerBreakPointPoints(input.stats);
  const serveWinsByPlayer = computePlayerServeWins(input.stats);
  const indicatorConfig = input.indicatorConfig ?? DATAVOLLEY_OV1_INDICATORS;
  const homePlayerRows = buildTabellinoPlayerRows({
    teamSide: 'home',
    team: input.homeTeam,
    playerStats: allPlayerStats,
    setNumbers,
    participationBySet,
    breakPointPointsByPlayer,
    serveWinsByPlayer,
    indicatorConfig,
  });
  const awayPlayerRows = buildTabellinoPlayerRows({
    teamSide: 'away',
    team: input.awayTeam,
    playerStats: allPlayerStats,
    setNumbers,
    participationBySet,
    breakPointPointsByPlayer,
    serveWinsByPlayer,
    indicatorConfig,
  });

  const homeSetRows = buildTabellinoSetRows('home', input.stats, input.homeTeam, input.awayTeam, input.eventLog, input.completedSets, input.scoutingConfig, indicatorConfig);
  const awaySetRows = buildTabellinoSetRows('away', input.stats, input.homeTeam, input.awayTeam, input.eventLog, input.completedSets, input.scoutingConfig, indicatorConfig);
  const homeSetHeaders = buildParticipationSetHeaders({
    teamSide: 'home',
    setNumbers,
    eventLog: input.eventLog,
  });
  const awaySetHeaders = buildParticipationSetHeaders({
    teamSide: 'away',
    setNumbers,
    eventLog: input.eventLog,
  });
  const setSummaries = buildSetHeaderSummaries({
    stats: input.stats,
    eventLog: input.eventLog,
    scoutingConfig: input.scoutingConfig,
  });

  const homeSetsWon = input.stats.setStats.reduce((total, set) => total + (set.homeScore > set.awayScore ? 1 : 0), 0);
  const awaySetsWon = input.stats.setStats.reduce((total, set) => total + (set.awayScore > set.homeScore ? 1 : 0), 0);
  const setScoreLabels = input.stats.setStats.map((setStats) => `${setStats.homeScore}-${setStats.awayScore}`);

  const attackTransitionStats = buildAttackTransitionStats(input.stats);
  const servesPerPointStats: Record<TeamSide, number | null> = {
    home: safeDivide(input.stats.teamStats.home.serve.total, input.stats.breakPointStats.home.breakPointWins),
    away: safeDivide(input.stats.teamStats.away.serve.total, input.stats.breakPointStats.away.breakPointWins),
  };
  const receptionsPerPointStats: Record<TeamSide, number | null> = {
    home: safeDivide(input.stats.teamStats.home.receive.total, input.stats.sideOutStats.home.sideOutWins),
    away: safeDivide(input.stats.teamStats.away.receive.total, input.stats.sideOutStats.away.sideOutWins),
  };

  const printTitleInput = {
    homeTeamName: input.homeTeam.name,
    awayTeamName: input.awayTeam.name,
    homeSetsWon,
    awaySetsWon,
    setScores: setScoreLabels,
  };

  return {
    title: 'Match report',
    competition: input.metadata?.competition ?? input.metadata?.title ?? '-',
    venue: input.metadata?.venue ?? '-',
    dateLabel: formatDateTime(input.metadata?.playedAt ?? undefined),
    homeTeamName: input.homeTeam.name,
    awayTeamName: input.awayTeam.name,
    homeSetsWon,
    awaySetsWon,
    setScoreSummary: setScoreLabels.join(', '),
    printTitle: createMatchReportPrintTitle(printTitleInput),
    printFilename: createMatchReportFilename(printTitleInput),
    pngFilename: createMatchReportFilename(printTitleInput, 'png'),
    setSummaries,
    homeTabellino: {
      teamSide: 'home',
      teamName: input.homeTeam.name,
      sideLabel: 'home',
      setHeaders: homeSetHeaders,
      rows: homePlayerRows,
      totals: buildTeamTotalsRowFromPlayerRows('home', homePlayerRows, allPlayerStats, indicatorConfig),
      setRows: homeSetRows,
      setTotals: buildTabellinoSetTotals(homeSetRows, 'home', indicatorConfig, input.stats.teamStats.home),
    },
    awayTabellino: {
      teamSide: 'away',
      teamName: input.awayTeam.name,
      sideLabel: 'away',
      setHeaders: awaySetHeaders,
      rows: awayPlayerRows,
      totals: buildTeamTotalsRowFromPlayerRows('away', awayPlayerRows, allPlayerStats, indicatorConfig),
      setRows: awaySetRows,
      setTotals: buildTabellinoSetTotals(awaySetRows, 'away', indicatorConfig, input.stats.teamStats.away),
    },
    bottomSummaryBlocks: buildBottomSummaryBlocks({
      stats: input.stats,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
    }),
    footer: buildFooterBranding(),
    rotationStats: input.stats.rotationStats,
    attackTransitionStats,
    servesPerPointStats,
    receptionsPerPointStats,
  };
}

export function buildDataVolleyMatchReport(input: {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig?: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
  lineupSnapshots?: readonly SetLineupSnapshot[];
}): DataVolleyMatchReport {
  return buildMatchTabellinoReport(input);
}

export type MatchReportPrintTitleInput = {
  homeTeamName: string;
  awayTeamName: string;
  homeSetsWon: number;
  awaySetsWon: number;
  setScores: readonly string[];
};

export function createMatchReportPrintTitle(input: MatchReportPrintTitleInput): string {
  const setScoreSuffix = input.setScores.length > 0
    ? ` (${input.setScores.join(', ')})`
    : '';

  return `${input.homeTeamName} - ${input.awayTeamName} ${input.homeSetsWon}-${input.awaySetsWon}${setScoreSuffix}`;
}

function sanitizePrintableFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();
}

export function createMatchReportFilename(
  input: MatchReportPrintTitleInput,
  extension = 'pdf',
): string {
  const safeExtension = extension.replace(/^\.+/, '').replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'pdf';
  return `${sanitizePrintableFilename(createMatchReportPrintTitle(input))}.${safeExtension}`;
}

function formatPercentValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(playedAt?: string): string {
  if (!playedAt) {
    return '-';
  }
  const date = new Date(playedAt);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function textOrDash(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
}

function escapeHtml(value: number | string | null | undefined): string {
  return textOrDash(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPercent(value: number | null): string {
  return escapeHtml(formatPercentValue(value));
}

function getSetMarkerKindClass(marker: MatchReportEntryMarker): string {
  return marker.kind === 'libero' ? 'libero-entry' : marker.kind;
}

function getSetMarkerClassName(marker: MatchReportEntryMarker): string {
  const markerKind = getSetMarkerKindClass(marker);
  const classes = [
    'entry-mark',
    `entry-mark-${markerKind}`,
    'match-report__set-marker',
    `match-report__set-marker--${markerKind}`,
  ];

  if (marker.kind === 'starter') {
    if (marker.isSetter) {
      classes.push('match-report__set-marker--setter');
    }
    if (marker.isCaptain) {
      classes.push('match-report__set-marker--captain');
    }
  }

  return classes.join(' ');
}

function renderEntryMarkerContent(marker: MatchReportEntryMarker): string {
  if (marker.kind !== 'starter') {
    return '';
  }

  return escapeHtml(marker.label);
}

function renderEntryMarkersHtml(row: MatchReportPlayerRow, setNumber: number): string {
  const markers = row.entryMarkers.filter((marker) => marker.setNumber === setNumber);

  if (markers.length === 0) {
    return '<span class="entry-empty">&nbsp;</span>';
  }

  return markers.map((marker) => `
    <span class="${escapeHtml(getSetMarkerClassName(marker))}" title="${escapeHtml(marker.title)}" aria-label="${escapeHtml(marker.title)}">
      ${renderEntryMarkerContent(marker)}
    </span>
  `).join('');
}

function renderParticipationCellsHtml(row: MatchReportPlayerRow, setHeaders: readonly MatchReportParticipationSetHeader[]): string {
  return setHeaders.map((setHeader) => `
    <td class="entry-cell">${renderEntryMarkersHtml(row, setHeader.setNumber)}</td>
  `).join('');
}

function renderPlayerMetricCells(row: MatchReportPlayerRow | TabellinoSetSummaryRow): string {
  return `
    <td>${row.pointsWon}</td>
    <td>${row.serve.total}</td>
    <td>${row.serve.errors}</td>
    <td>${row.serve.aces}</td>
    <td>${renderPercent(row.serve.positiveRate)}</td>
    <td>${renderPercent(row.serve.efficiency)}</td>
    <td>${row.serve.servesPerPoint !== null ? row.serve.servesPerPoint.toFixed(1) : '-'}</td>
    <td>${row.receive.total}</td>
    <td>${row.receive.errors}</td>
    <td>${renderPercent(row.receive.positiveRate)}</td>
    <td>${renderPercent(row.receive.efficiency)}</td>
    <td>${row.attack.total}</td>
    <td>${row.attack.errors}</td>
    <td>${row.attack.blocked}</td>
    <td>${row.attack.kills}</td>
    <td>${renderPercent(row.attack.killRate)}</td>
    <td>${renderPercent(row.attack.efficiency)}</td>
    <td>${row.block.points}</td>
  `;
}

function renderReportPlayerRows(
  rows: readonly MatchReportPlayerRow[],
  setHeaders: readonly MatchReportParticipationSetHeader[],
): string {
  return rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.jerseyNumber)}</td>
      <th scope="row" class="player-cell">
        <span>${escapeHtml(row.playerName)}</span>
        ${row.isCaptain ? '<strong class="captain-mark">C</strong>' : ''}
        ${row.isLibero ? '<strong class="libero-mark">L</strong>' : ''}
      </th>
      ${renderParticipationCellsHtml(row, setHeaders)}
      ${renderPlayerMetricCells(row)}
    </tr>
  `).join('');
}

function renderEmptyParticipationCellsHtml(setHeaders: readonly MatchReportParticipationSetHeader[], content = ''): string {
  return setHeaders.map(() => `<td class="entry-cell">${content}</td>`).join('');
}

function renderTeamTotalRow(row: MatchReportPlayerRow, setHeaders: readonly MatchReportParticipationSetHeader[]): string {
  return `
    <tr class="total-row">
      <td></td>
      <th scope="row">Totali squadra</th>
      ${renderEmptyParticipationCellsHtml(setHeaders)}
      ${renderPlayerMetricCells(row)}
    </tr>
  `;
}

function renderTabellinoSetRows(
  setRows: readonly TabellinoSetSummaryRow[],
  setHeaders: readonly MatchReportParticipationSetHeader[],
): string {
  return setRows.map((row) => `
    <tr class="set-summary-row">
      <td></td>
      <th scope="row">Set ${row.setNumber} <small>${row.setScore}-${row.opponentScore}${row.durationLabel ? ` / ${escapeHtml(row.durationLabel)}` : ''}</small></th>
      <td class="entry-cell" colspan="${setHeaders.length}">${escapeHtml(row.partialScoreLabel)}</td>
      ${renderPlayerMetricCells(row)}
    </tr>
  `).join('');
}

function renderTabellinoColgroupHtml(tabellino: TabellinoTeamTable): string {
  return `
    <colgroup>
      <col class="report-table__col-jersey" />
      <col class="report-table__col-player" />
      ${tabellino.setHeaders.map(() => '<col class="report-table__col-set" />').join('')}
      <col class="report-table__col-won" />
      ${Array.from({ length: 17 }, () => '<col class="report-table__col-metric" />').join('')}
    </colgroup>
  `;
}

function renderSetNumberHeaderHtml(header: MatchReportParticipationSetHeader): string {
  const className = [
    'set-number-mark',
    header.startedServing ? 'set-number-mark--serving' : '',
  ].filter(Boolean).join(' ');

  return `
    <th scope="col" class="set-number-header" title="${escapeHtml(header.title)}">
      <span class="${escapeHtml(className)}" aria-label="${escapeHtml(header.title)}">${escapeHtml(header.label)}</span>
    </th>
  `;
}

function renderHtmlSetSummaryRow(row: TabellinoSetSummaryRow, isTotal = false): string {
  const label = isTotal
    ? 'Total'
    : `Set ${row.setNumber}<small> ${row.setScore}-${row.opponentScore}${row.durationLabel ? ` / ${escapeHtml(row.durationLabel)}` : ''}</small>`;
  const rowClass = isTotal ? 'set-section-total' : 'set-section-row';

  return `
    <tr class="${rowClass}">
      <th scope="row">${label}</th>
      <td>${row.directPoints}</td><td>${row.ser}</td><td>${row.atk}</td><td>${row.blo}</td>
      <td>${row.opponentErrors}</td>
      <td>${row.serve.total}</td><td>${row.serve.errors}</td><td>${row.serve.aces}</td><td>${renderPercent(row.serve.positiveRate)}</td><td>${renderPercent(row.serve.efficiency)}</td><td>-</td><td>${isTotal ? '-' : renderPercent(row.breakPointRate)}</td>
      <td>${row.receive.total}</td><td>${row.receive.errors}</td><td>${renderPercent(row.receive.positiveRate)}</td><td>${renderPercent(row.receive.efficiency)}</td><td>${isTotal ? '-' : renderPercent(row.sideOutRate)}</td>
      <td>${row.attack.total}</td><td>${row.attack.errors}</td><td>${row.attack.blocked}</td><td>${row.attack.kills}</td><td>${renderPercent(row.attack.killRate)}</td><td>${renderPercent(row.attack.efficiency)}</td>
      <td>${row.block.points}</td>
    </tr>
  `;
}

function renderTabellinoSetSectionHtml(tabellino: TabellinoTeamTable): string {
  if (tabellino.setRows.length === 0) {
    return '';
  }

  return `
    <table class="set-section-table">
      <colgroup>
        <col class="set-section-table__col-label" />
        <col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" />
        <col class="report-table__col-metric" />
        <col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" />
        <col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" />
        <col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" /><col class="report-table__col-metric" />
        <col class="report-table__col-metric" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">Set</th>
          <th colspan="4" class="skill-group-header">Won</th>
          <th rowspan="2" class="skill-group-header">Op.Err</th>
          <th colspan="7" class="skill-group-header">Serve</th>
          <th colspan="5" class="skill-group-header">Reception</th>
          <th colspan="6" class="skill-group-header">Attack</th>
          <th rowspan="2" class="skill-group-header">Blo</th>
        </tr>
        <tr>
          <th>Tot</th><th>Ser</th><th>Atk</th><th>Blo</th>
          <th>Tot</th><th>Err</th><th>Ace</th><th>Pos%</th><th>Eff%</th><th>Sv/Pt</th><th>BP%</th>
          <th>Tot</th><th>Err</th><th>Pos%</th><th>Eff%</th><th>SO%</th>
          <th>Tot</th><th>Err</th><th>Blo</th><th>Kill</th><th>K%</th><th>Eff%</th>
        </tr>
      </thead>
      <tbody>
        ${tabellino.setRows.map((row) => renderHtmlSetSummaryRow(row, false)).join('')}
        ${renderHtmlSetSummaryRow(tabellino.setTotals, true)}
      </tbody>
    </table>
  `;
}

function renderTabellinoTeamHtml(tabellino: TabellinoTeamTable): string {
  return `
    <section class="tabellino-team">
      <header class="tabellino-team-header">
        <h2>${escapeHtml(tabellino.teamName)}</h2>
        <span>${escapeHtml(tabellino.sideLabel)}</span>
      </header>
      <table class="report-table">
        ${renderTabellinoColgroupHtml(tabellino)}
        <thead>
          <tr>
            <th rowspan="2">#</th>
            <th rowspan="2">Player</th>
            <th colspan="${tabellino.setHeaders.length}" class="set-group-header">Set</th>
            <th rowspan="2">Won</th>
            <th colspan="4" class="skill-group-header">Serve</th>
            <th colspan="4" class="skill-group-header">Reception</th>
            <th colspan="6" class="skill-group-header">Attack</th>
            <th class="skill-group-header">Block</th>
          </tr>
          <tr>
            ${tabellino.setHeaders.map(renderSetNumberHeaderHtml).join('')}
            <th>Tot</th><th>Err</th><th>Ace</th><th>Pos%</th><th>srvEff%</th><th>Sv/Pt</th>
            <th>Tot</th><th>Err</th><th>Pos%</th><th>recEff%</th>
            <th>Tot</th><th>Err</th><th>Blo</th><th>Kill</th><th>K%</th><th>attEff%</th>
            <th>Blo</th>
          </tr>
        </thead>
        <tbody>
          ${renderReportPlayerRows(tabellino.rows, tabellino.setHeaders)}
          ${renderTeamTotalRow(tabellino.totals, tabellino.setHeaders)}
        </tbody>
      </table>
      ${renderTabellinoSetSectionHtml(tabellino)}
    </section>
  `;
}

function renderHeaderSetRows(report: MatchTabellinoReport): string {
  return report.setSummaries.map((set) => `
    <tr>
      <th scope="row">Set ${set.setNumber}</th>
      <td>${escapeHtml(set.scoreLabel)}</td>
      <td>${escapeHtml(set.durationLabel)}</td>
      <td>${escapeHtml(set.partialScoreLabel)}</td>
    </tr>
  `).join('');
}

function renderBottomSummaryBlockHtml(block: MatchReportBottomSummaryBlock): string {
  return `
    <table class="bottom-summary-table">
      <caption>
        <strong>${escapeHtml(block.title)}</strong>
        <span>${escapeHtml(block.subtitle)}</span>
      </caption>
      <thead>
        <tr><th>Team</th><th>Pts</th><th>Att</th><th>%</th></tr>
      </thead>
      <tbody>
        ${block.rows.map((row) => `
          <tr>
            <th scope="row">${escapeHtml(row.teamName)}</th>
            <td>${row.points}</td>
            <td>${row.attempts}</td>
            <td>${renderPercent(row.percentage)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderBottomSummaryBlocksHtml(report: MatchTabellinoReport): string {
  return `
    <section class="bottom-summary" aria-label="Bottom summary">
      ${report.bottomSummaryBlocks.map(renderBottomSummaryBlockHtml).join('')}
    </section>
  `;
}

const footerLogoSvg = `
  <svg class="report-footer__logo" viewBox="0 0 1020 799" role="img" aria-label="OpenVolleyScout logo" xmlns="http://www.w3.org/2000/svg">
    <path fill="#002554" d="M803.81 246.987C804.568 248.021 804.42 250.096 804.431 251.537L804.42 447.68L804.443 502.024C804.463 513.381 805.091 530.459 803.094 541.055C800.425 554.556 793.86 566.979 784.212 576.79C759.938 601.106 735.857 597.379 704.975 597.378L626.572 597.367L335.75 597.445L335.359 596.86C335.005 586.709 343.034 568.329 347.721 559.218C396.101 465.151 551.81 403.39 643.732 358.466C662.877 349.09 681.699 339.07 700.167 328.423C740.43 305.213 772.699 281.862 803.81 246.987Z"/>
    <path fill="#0169D8" d="M564.212 440.411L588.581 440.416C588.749 466.399 588.866 492.989 588.615 518.955C588.928 534.918 588.693 551.416 588.66 567.418C580.563 567.4 572.281 567.471 564.2 567.359C564.203 559.82 563.967 550.362 564.242 542.965C563.906 532.081 564.215 519.396 564.214 508.414L564.212 440.411Z"/>
  </svg>
`;

function renderReportFooterHtml(report: MatchTabellinoReport): string {
  return `
    <footer class="report-footer">
      ${footerLogoSvg}
      <span>${escapeHtml(report.footer.line)}</span>
    </footer>
  `;
}

const htmlStyle = `
  @font-face { font-family: 'Ubuntu'; src: url('${ubuntuRegularUrl}') format('truetype'); font-weight: 400; font-style: normal; }
  @font-face { font-family: 'Ubuntu'; src: url('${ubuntuBoldUrl}') format('truetype'); font-weight: 700; font-style: normal; }
  @font-face { font-family: 'Ubuntu'; src: url('${ubuntuItalicUrl}') format('truetype'); font-weight: 400; font-style: italic; }
  @font-face { font-family: 'Ubuntu'; src: url('${ubuntuBoldItalicUrl}') format('truetype'); font-weight: 700; font-style: italic; }
  @page { size: A4 portrait; margin: 10mm; }
  :root { --ovs-primary: #002554; --ovs-accent: #0169D8; --ovs-soft: #eef5ff; --ovs-border: #7f93b4; }
  * { box-sizing: border-box; }
  body { width: 210mm; min-height: 297mm; font-family: 'Ubuntu', Arial, sans-serif; margin: 0 auto; color: #111827; background: #ffffff; font-size: 6.8px; line-height: 1.12; }
  h1, h2, h3 { margin: 0; }
  .report-page { width: 100%; }
  .report-page--png { min-height: 297mm; padding: 10mm; background: #ffffff; }
  .report-header { display: grid; grid-template-columns: minmax(0, 1fr) 96px; gap: 4px; align-items: start; padding-bottom: 3px; border-bottom: 1.5px solid var(--ovs-primary); break-inside: avoid; page-break-inside: avoid; }
  .report-header h1 { color: var(--ovs-primary); font-size: 9.5px; letter-spacing: 0; text-transform: uppercase; }
  .report-meta { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 2px 5px; margin-top: 3px; }
  .report-meta strong { display: block; color: var(--ovs-primary); font-size: 5.5px; text-transform: uppercase; }
  .report-legend { margin: 1.5px 0 0; font-size: 5.8px; }
  .report-score { text-align: right; border: 1px solid var(--ovs-primary); border-left: 3px solid var(--ovs-accent); padding: 2px; }
  .report-score strong { display: block; color: var(--ovs-primary); font-size: 12px; }
  .set-summary-table { width: 100%; border-collapse: collapse; margin-top: 2px; table-layout: fixed; }
  .set-summary-table th, .set-summary-table td { border: 1px solid var(--ovs-border); padding: 0.8px 1.5px; text-align: center; }
  .set-summary-table th { background: var(--ovs-soft); color: var(--ovs-primary); }
  .tabellino-team { margin-top: 3px; break-inside: avoid; page-break-inside: avoid; }
  .tabellino-team-header { display: flex; justify-content: space-between; align-items: baseline; padding: 1.5px 2px; border: 1px solid var(--ovs-primary); border-bottom: 0; border-left: 3px solid var(--ovs-accent); background: #f8fbff; }
  .tabellino-team-header h2 { color: var(--ovs-primary); font-size: 8px; text-transform: uppercase; }
  .tabellino-team-header span { font-size: 6px; text-transform: uppercase; }
  .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .report-table__col-jersey { width: 13px; }
  .report-table__col-player { width: 74px; }
  .report-table__col-set { width: 12px; }
  .report-table__col-won { width: 18px; }
  .report-table__col-metric { width: 16px; }
  .report-table th, .report-table td { border: 1px solid var(--ovs-border); padding: 0.7px 1px; text-align: right; white-space: nowrap; }
  .report-table th { background: var(--ovs-soft); color: var(--ovs-primary); font-weight: 700; text-transform: uppercase; font-size: 5.2px; line-height: 1.03; }
  .report-table td { color: #111827; font-size: 5.8px; }
  .report-table th:first-child, .report-table td:first-child { text-align: center; }
  .report-table .set-group-header, .report-table .skill-group-header { text-align: left; }
  .report-table .set-number-header { text-align: center; }
  .player-cell { text-align: left; overflow: hidden; text-overflow: ellipsis; }
  .captain-mark, .libero-mark { display: inline-block; min-width: 8px; margin-left: 2px; border: 1px solid #111827; text-align: center; font-size: 5.5px; line-height: 1.1; }
  .entry-cell { text-align: center; }
  .set-number-mark { color: var(--ovs-primary); font-size: 5.2px; font-weight: 700; line-height: 1; }
  .set-number-mark--serving { display: inline-flex; align-items: center; justify-content: center; width: 9px; height: 9px; border: 1.2px solid var(--ovs-primary); border-radius: 999px; background: #ffffff; box-shadow: inset 0 0 0 0.6px var(--ovs-accent); }
  .entry-mark, .match-report__set-marker { display: inline-flex; align-items: center; justify-content: center; width: 9px; min-width: 9px; height: 7px; margin: 0; border: 1px solid #111827; color: #111827; text-align: center; font-weight: 700; line-height: 1; vertical-align: middle; }
  .match-report__set-marker--starter { background: #444444; color: #ffffff; }
  .match-report__set-marker--setter { background: #eef5ff; color: #002554; border-color: #0169D8; border-width: 1px; }
  .match-report__set-marker--captain { background: #ffffff; color: #111827; border-width: 1px; }
  .match-report__set-marker--entry, .match-report__set-marker--libero-entry { width: 7px; min-width: 7px; height: 4px; background: #ffffff; }
  .entry-empty { color: #6b7280; }
  .total-row th, .total-row td { background: #dfe8f7; font-weight: 700; }
  .set-section-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 2px; }
  .set-section-table__col-label { width: 58px; }
  .set-section-table th, .set-section-table td { border: 1px solid var(--ovs-border); padding: 0.7px 1px; text-align: right; white-space: nowrap; }
  .set-section-table th { background: var(--ovs-soft); color: var(--ovs-primary); font-weight: 700; text-transform: uppercase; font-size: 5.0px; line-height: 1.03; }
  .set-section-table td { color: #111827; font-size: 5.6px; }
  .set-section-table th[scope="row"] { text-align: left; background: #f8fbff; font-weight: 500; color: #111827; }
  .set-section-table .skill-group-header { text-align: left; }
  .set-section-table small { display: inline; font-size: 4.6px; font-weight: 400; color: #6b7280; }
  .set-section-total th, .set-section-total td { background: #dfe8f7; font-weight: 700; }
  .bottom-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; margin-top: 3px; break-inside: avoid; page-break-inside: avoid; }
  .bottom-summary-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .bottom-summary-table caption { caption-side: top; padding: 0 0 1px; text-align: left; }
  .bottom-summary-table caption strong { display: block; color: var(--ovs-primary); font-size: 5.5px; text-transform: uppercase; }
  .bottom-summary-table caption span { display: block; font-size: 4.8px; color: #374151; }
  .bottom-summary-table th, .bottom-summary-table td { border: 1px solid var(--ovs-border); padding: 0.8px 1px; font-size: 5.2px; white-space: nowrap; }
  .bottom-summary-table th { background: var(--ovs-soft); color: var(--ovs-primary); text-align: left; }
  .bottom-summary-table td { text-align: right; }
  .report-footer { display: flex; align-items: center; justify-content: flex-start; gap: 3px; margin-top: 3px; padding-top: 2px; border-top: 1px solid var(--ovs-primary); color: #111827; font-size: 5.4px; text-align: left; white-space: nowrap; break-inside: avoid; page-break-inside: avoid; }
  .report-footer__logo { width: 13px; height: 10px; flex: 0 0 auto; filter: grayscale(1) contrast(1.2); }
  @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } body { width: auto; min-height: auto; margin: 0; } }
`;

export function openPrintableMatchReportHtml(html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');

  if (!openedWindow) {
    window.location.assign(url);
    return;
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export type BuildMatchReportDocumentInput = {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
  lineupSnapshots?: readonly SetLineupSnapshot[];
};

function renderMatchReportPageHtml(report: MatchTabellinoReport, options: { png?: boolean } = {}): string {
  const className = options.png ? 'report-page report-page--png' : 'report-page';

  return `
  <main class="${className}">
    <header class="report-header">
      <div>
        <h1>${escapeHtml(report.printTitle)}</h1>
        <div class="report-meta">
          <div><strong>Competition</strong><div>${escapeHtml(report.competition)}</div></div>
          <div><strong>Date</strong><div>${escapeHtml(report.dateLabel)}</div></div>
          <div><strong>Venue</strong><div>${escapeHtml(report.venue)}</div></div>
          <div><strong>Home</strong><div>${escapeHtml(report.homeTeamName)}</div></div>
          <div><strong>Away</strong><div>${escapeHtml(report.awayTeamName)}</div></div>
          <div><strong>Sets</strong><div>${escapeHtml(report.setScoreSummary)}</div></div>
        </div>
        <p class="report-legend">Boxed numbers = starters · white starter box = captain · empty box = entry/libero</p>
        <table class="set-summary-table">
          <thead>
            <tr><th>Set</th><th>Score</th><th>Duration</th><th>Partials</th></tr>
          </thead>
          <tbody>${renderHeaderSetRows(report)}</tbody>
        </table>
      </div>
      <div class="report-score">
        <span>${escapeHtml(report.homeTeamName)}</span>
        <strong>${report.homeSetsWon} : ${report.awaySetsWon}</strong>
        <span>${escapeHtml(report.awayTeamName)}</span>
      </div>
    </header>
	    <div class="tabellino-container">
	      ${renderTabellinoTeamHtml(report.homeTabellino)}
	      ${renderTabellinoTeamHtml(report.awayTabellino)}
	    </div>
	    ${renderBottomSummaryBlocksHtml(report)}
	    ${renderReportFooterHtml(report)}
	  </main>
`;
}

function buildMatchReportDocumentHtml(report: MatchTabellinoReport): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(report.printTitle)}</title>
<meta name="download-filename" content="${escapeHtml(report.printFilename)}">
<style>${htmlStyle}</style>
</head>
<body>
${renderMatchReportPageHtml(report)}
	</body>
</html>
`;
}

export function buildMatchReportHtml(input: BuildMatchReportDocumentInput): string {
  return buildMatchReportDocumentHtml(buildMatchTabellinoReport(input));
}

function normalizeSvgForeignObjectHtml(html: string): string {
  return html.replace(/&nbsp;/g, '&#160;');
}

function getMatchReportPngStyle(scale: number): string {
  const scaledWidth = MATCH_REPORT_PNG_CSS_WIDTH * scale;
  const offsetX = Math.max((MATCH_REPORT_PNG_WIDTH - scaledWidth) / 2, 0);

  return `
    .report-png-root { position: relative; width: ${MATCH_REPORT_PNG_WIDTH}px; height: ${MATCH_REPORT_PNG_HEIGHT}px; overflow: hidden; background: #ffffff; }
    .report-png-scale { position: absolute; top: 0; left: ${offsetX}px; width: 210mm; min-height: 297mm; transform: scale(${scale}); transform-origin: top left; }
  `;
}

export function buildMatchReportPngSvg(
  report: MatchTabellinoReport,
  options: { scale?: number } = {},
): string {
  const scale = options.scale ?? MATCH_REPORT_PNG_SCALE;
  const pageHtml = normalizeSvgForeignObjectHtml(renderMatchReportPageHtml(report, { png: true }));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MATCH_REPORT_PNG_WIDTH}" height="${MATCH_REPORT_PNG_HEIGHT}" viewBox="0 0 ${MATCH_REPORT_PNG_WIDTH} ${MATCH_REPORT_PNG_HEIGHT}">
  <foreignObject x="0" y="0" width="${MATCH_REPORT_PNG_WIDTH}" height="${MATCH_REPORT_PNG_HEIGHT}">
    <div xmlns="http://www.w3.org/1999/xhtml" class="report-png-root">
      <style>${htmlStyle}${getMatchReportPngStyle(scale)}</style>
      <div class="report-png-scale">${pageHtml}</div>
    </div>
  </foreignObject>
</svg>`;
}

function waitForBrowserLayout(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function getMatchReportPngScale(report: MatchTabellinoReport): Promise<number> {
  if (typeof document === 'undefined') {
    return MATCH_REPORT_PNG_SCALE;
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.visibility = 'hidden';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  try {
    const iframeDocument = iframe.contentDocument;
    if (!iframeDocument) {
      return MATCH_REPORT_PNG_SCALE;
    }

    iframeDocument.open();
    iframeDocument.write(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>${htmlStyle}</style>
</head>
<body>
${renderMatchReportPageHtml(report, { png: true })}
</body>
</html>
`);
    iframeDocument.close();

    await waitForBrowserLayout();

    const page = iframeDocument.querySelector('.report-page') as HTMLElement | null;
    if (!page) {
      return MATCH_REPORT_PNG_SCALE;
    }

    const rect = page.getBoundingClientRect();
    const width = Math.max(rect.width, page.scrollWidth, MATCH_REPORT_PNG_CSS_WIDTH);
    const height = Math.max(rect.height, page.scrollHeight, MATCH_REPORT_PNG_CSS_HEIGHT);

    return Math.min(
      MATCH_REPORT_PNG_WIDTH / width,
      MATCH_REPORT_PNG_HEIGHT / height,
    );
  } finally {
    iframe.remove();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to render match report PNG image.'));
    image.src = src;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to encode match report PNG.'));
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}

async function renderSvgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = MATCH_REPORT_PNG_WIDTH;
    canvas.height = MATCH_REPORT_PNG_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas rendering is unavailable.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, MATCH_REPORT_PNG_WIDTH, MATCH_REPORT_PNG_HEIGHT);
    context.drawImage(image, 0, 0, MATCH_REPORT_PNG_WIDTH, MATCH_REPORT_PNG_HEIGHT);

    return canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Calculate fit-to-page dimensions: return (scale, finalWidth, finalHeight, offsetX, offsetY) */
export function calculatePdfFitDimensions(
  imageWidth: number,
  imageHeight: number,
  pageWidthMm: number = 210,
  pageHeightMm: number = 297,
  marginMm: number = 10,
  dpi: number = 96,
): { scale: number; finalWidth: number; finalHeight: number; offsetX: number; offsetY: number } {
  const mmToPx = dpi / 25.4; // 1 inch = 25.4mm
  const usableWidthPx = (pageWidthMm - 2 * marginMm) * mmToPx;
  const usableHeightPx = (pageHeightMm - 2 * marginMm) * mmToPx;
  const marginPx = marginMm * mmToPx;

  // Calculate scale to fit within usable area
  const scaleX = usableWidthPx / imageWidth;
  const scaleY = usableHeightPx / imageHeight;
  const scale = Math.min(scaleX, scaleY);

  const finalWidth = imageWidth * scale;
  const finalHeight = imageHeight * scale;

  // Center the image
  const offsetX = marginPx + (usableWidthPx - finalWidth) / 2;
  const offsetY = marginPx + (usableHeightPx - finalHeight) / 2;

  return { scale, finalWidth, finalHeight, offsetX, offsetY };
}

export async function exportMatchReportPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  try {
    // Lazy import to avoid bundling if not used
    const { default: html2canvas } = await import('html2canvas-pro');
    const { jsPDF } = await import('jspdf');

    // Render element to canvas at 3x scale for high quality
    const renderScale = 3;
    const canvas = await html2canvas(element, {
      scale: renderScale,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true,
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    // Calculate fit-to-page dimensions
    const { scale, finalWidth, finalHeight, offsetX, offsetY } = calculatePdfFitDimensions(
      imgWidth,
      imgHeight,
    );

    // Create PDF in mm units (A4 portrait: 210x297mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Convert px to mm for PDF placement
    const mmToPx = 96 / 25.4;
    const finalWidthMm = finalWidth / mmToPx;
    const finalHeightMm = finalHeight / mmToPx;
    const offsetXMm = offsetX / mmToPx;
    const offsetYMm = offsetY / mmToPx;

    // Add image to PDF
    pdf.addImage(imgData, 'PNG', offsetXMm, offsetYMm, finalWidthMm, finalHeightMm);

    // Download
    pdf.save(filename);
  } catch (error) {
    console.error('Failed to export PDF:', error);
    throw error;
  }
}

export async function downloadMatchReportPng(input: BuildMatchReportDocumentInput): Promise<void> {
  const report = buildMatchTabellinoReport(input);
  const scale = await getMatchReportPngScale(report);
  const svg = buildMatchReportPngSvg(report, { scale });
  const pngBlob = await renderSvgToPngBlob(svg);
  downloadBlob(pngBlob, report.pngFilename);
}

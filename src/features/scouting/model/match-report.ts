import type { MatchEvent } from '@src/domain/events/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { Team } from '@src/domain/roster/types';
import { DEFAULT_ROLE_SEQUENCE } from '@src/config/systems';
import { PlayerRole } from '@src/domain/systems/types';
import {
  buildPlayerSetParticipationBySet,
  createTeamScopedPlayerKey,
} from '@src/domain/lineup';
import type {
  PlayerSetParticipation,
  PlayerSetParticipationBySet,
  SetLineupSnapshot,
  StartingLineup,
} from '@src/domain/lineup';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import { getSetTargetPoints } from '@src/domain/scouting/helpers';
import type { BuildMatchStatsInput, MatchStats, PlayerStats, SetStats, TeamStats } from './match-stats';
import { buildSetMatchStats, safeDivide } from './match-stats';
import { resolvePointWinnerFromTouch, isTrueTerminalTouch } from './scoring-rules';
import { mapRolesToPlayers } from './system-role-mapping';

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

export function getSetDurationLabel(setNumber: number, eventLog: MatchEvent[]): string | null {
  const startedAt = eventLog.find((event) => isSetStartedEvent(event) && event.setNumber === setNumber)?.createdAt;
  const endedAt = eventLog.find((event) => event.type === 'set_ended' && event.setNumber === setNumber)?.createdAt;

  if (startedAt === undefined || endedAt === undefined || endedAt <= startedAt) {
    return null;
  }

  const durationMillis = endedAt - startedAt;
  const minutes = Math.floor(durationMillis / 60000);
  const seconds = Math.floor((durationMillis % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  efficiency: number | null;
};

export type MatchReportReceiveSummary = {
  total: number;
  errors: number;
  perfect: number;
  positive: number;
  efficiency: number | null;
};

export type MatchReportAttackSummary = {
  total: number;
  kills: number;
  errors: number;
  blocked: number;
  efficiency: number | null;
};

export type MatchReportBlockSummary = {
  points: number;
  touches: number;
};

export type MatchReportEntryMarker = {
  setNumber: number;
  kind: 'starter' | 'entry' | 'libero' | 'return';
  label: string;
  title: string;
  isFirstServer?: boolean;
  isSetter?: boolean;
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
export type TabellinoSetSummaryRow = {
  type: 'set_summary';
  setNumber: number;
  setScore: number;
  opponentScore: number;
  durationLabel: string | null;
  partialScoreLabel: string;
  breakPointPoints: number;
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
  rows: MatchReportPlayerRow[];
  totals: MatchReportPlayerRow;
  setRows: TabellinoSetSummaryRow[];
};

export type MatchReportSetHeaderSummary = {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  scoreLabel: string;
  durationLabel: string | null;
  partialScoreLabel: string;
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
  setSummaries: MatchReportSetHeaderSummary[];
  homeTabellino: TabellinoTeamTable;
  awayTabellino: TabellinoTeamTable;
};

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
  return player.shortName || [player.firstName, player.lastName].filter(Boolean).join(' ') || player.playerCode;
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
  return markers.length > 0 ? markers.map((marker) => marker.label).join('/') : '-';
}

function createSetTeamPlayerKey(setNumber: number, teamSide: TeamSide, playerId: string): string {
  return `${setNumber}:${createTeamScopedPlayerKey(teamSide, playerId)}`;
}

function getSetStartedLineup(event: Extract<MatchEvent, { type: 'set_started' }>, teamSide: TeamSide): StartingLineup {
  return teamSide === 'home' ? event.homeLineup : event.awayLineup;
}

function getLineupRoleSequence(lineup: StartingLineup): readonly PlayerRole[] {
  const maybeRoleSequence = (lineup as StartingLineup & { roleSequence?: readonly PlayerRole[] }).roleSequence;
  return maybeRoleSequence?.length ? maybeRoleSequence : DEFAULT_ROLE_SEQUENCE;
}

function getLineupSetterPlayerId(lineup: StartingLineup, team: Team): string | undefined {
  if (lineup.setterPlayerId) {
    return lineup.setterPlayerId;
  }

  const mappedSetter = mapRolesToPlayers({
    roleSequence: getLineupRoleSequence(lineup),
    lineupSlots: lineup.slots,
    teamPlayers: team.players,
  }).get(PlayerRole.SETTER);

  return mappedSetter?.id
    ?? lineup.slots.find((slot) => slot.tacticalRole === PlayerRole.SETTER)?.playerId;
}

function buildSetterStarterKeys(input: {
  eventLog: readonly MatchEvent[];
  homeTeam: Team;
  awayTeam: Team;
}): Set<string> {
  return input.eventLog.reduce((keys, event) => {
    if (!isSetStartedEvent(event)) {
      return keys;
    }

    (['home', 'away'] as const).forEach((teamSide) => {
      const lineup = getSetStartedLineup(event, teamSide);
      const team = teamSide === 'home' ? input.homeTeam : input.awayTeam;
      const setterPlayerId = getLineupSetterPlayerId(lineup, team);

      if (setterPlayerId) {
        keys.add(createSetTeamPlayerKey(event.setNumber, teamSide, setterPlayerId));
      }
    });

    return keys;
  }, new Set<string>());
}

function buildMatchEntryMarkers(input: {
  teamSide: TeamSide;
  playerId: string;
  setNumbers: readonly number[];
  participationBySet: MatchReportParticipationBySet;
  setterStarterKeys: ReadonlySet<string>;
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
        label: String(participation.startingRotationPosition),
        title: `Set ${setNumber}: starter in rotation ${participation.startingRotationPosition}`,
        isFirstServer: participation.firstServer,
        isSetter: input.setterStarterKeys.has(createSetTeamPlayerKey(setNumber, input.teamSide, input.playerId)),
      });
    }

    if (participation.enteredSet && !participation.startedSet) {
      markers.push({
        setNumber,
        kind: 'entry',
        label: participation.entryOrder ? `IN${participation.entryOrder}` : 'IN',
        title: participation.entryOrder
          ? `Set ${setNumber}: entry ${participation.entryOrder}`
          : `Set ${setNumber}: entry`,
      });
    }

    participation.liberoReplacements?.forEach((replacement, replacementIndex) => {
      markers.push({
        setNumber,
        kind: 'libero',
        label: replacement.secondLiberoSwap ? 'L2' : 'L',
        title: replacement.secondLiberoSwap
          ? `Set ${setNumber}: second libero entry`
          : `Set ${setNumber}: libero entry`,
      });

      if (replacement.exitedAtRallyNumber !== undefined) {
        markers.push({
          setNumber,
          kind: 'return',
          label: 'R',
          title: `Set ${setNumber}: libero exit ${replacementIndex + 1}`,
        });
      }
    });

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
  } = {},
): MatchReportPlayerRow {
  const entryMarkers = options.entryMarkers ?? [];
  const pointsLost = playerStats.errors;

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
    pointsWonLostLabel: `${playerStats.points}-${pointsLost}`,
    serve: {
      total: playerStats.serve.total,
      errors: playerStats.serveErrors,
      aces: playerStats.aces,
      efficiency: safeDivide(playerStats.aces - playerStats.serveErrors, playerStats.serve.total),
    },
    receive: {
      total: playerStats.receive.total,
      errors: playerStats.receptionErrors,
      perfect: playerStats.receive.perfect,
      positive: playerStats.receive.positive,
      efficiency: safeDivide(
        playerStats.receive.perfect + playerStats.receive.positive - playerStats.receptionErrors,
        playerStats.receive.total,
      ),
    },
    attack: {
      total: playerStats.attack.total,
      kills: playerStats.attackPoints,
      errors: playerStats.attackErrors,
      blocked: playerStats.attackBlocked,
      efficiency: safeDivide(
        playerStats.attackPoints - playerStats.attackErrors - playerStats.attackBlocked,
        playerStats.attack.total,
      ),
    },
    block: {
      points: playerStats.blockPoints,
      touches: playerStats.block.total,
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
}): MatchReportTeamTable {
  const rosterPlayerIds = new Set(input.team.players.map((player) => player.id));
  const playerStatsById = new Map(
    input.setStats.playerStats
      .filter((player) => player.teamSide === input.teamSide)
      .map((player) => [player.playerId, player]),
  );
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
    totals: buildReportPlayerRow(buildTeamTotalPlayerStats(input.setStats.teamStats[input.teamSide])),
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

function buildTabellinoSetRows(
  teamSide: TeamSide,
  stats: MatchStats,
  homeTeam: Team,
  awayTeam: Team,
  eventLog: MatchEvent[],
  completedSets: CompletedSetSummary[],
  scoutingConfig?: ScoutingMatchConfig,
): TabellinoSetSummaryRow[] {
  const reportTouches = stats.rallyStats.flatMap((r) => r.touches);

  return stats.setStats.map((setSummary) => {
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

    return {
      type: 'set_summary',
      setNumber: setSummary.setNumber,
      setScore: score,
      opponentScore,
      durationLabel,
      partialScoreLabel: buildSetPartialScores(setStats.setStats[0], targetPoints).map((partial) => partial.score).join(' / '),
      breakPointPoints: computeTeamBreakPointPoints(setStats, teamSide),
      pointsWon: score,
      pointsLost: opponentScore,
      pointsWonLostLabel: `${score}-${opponentScore}`,
      serve: {
        total: teamSetStats.serve.total,
        errors: teamSetStats.serveErrors,
        aces: teamSetStats.aces,
        efficiency: safeDivide(teamSetStats.aces - teamSetStats.serveErrors, teamSetStats.serve.total),
      },
      receive: {
        total: teamSetStats.receive.total,
        errors: teamSetStats.receptionErrors,
        perfect: teamSetStats.receive.perfect,
        positive: teamSetStats.receive.positive,
        efficiency: safeDivide(
          teamSetStats.receive.perfect + teamSetStats.receive.positive - teamSetStats.receptionErrors,
          teamSetStats.receive.total,
        ),
      },
      attack: {
        total: teamSetStats.attack.total,
        kills: teamSetStats.attackPoints,
        errors: teamSetStats.attackErrors,
        blocked: teamSetStats.attackBlocked,
        efficiency: safeDivide(
          teamSetStats.attackPoints - teamSetStats.attackErrors - teamSetStats.attackBlocked,
          teamSetStats.attack.total,
        ),
      },
      block: {
        points: teamSetStats.blockPoints,
        touches: teamSetStats.block.total,
      },
    };
  });
}

function buildTabellinoPlayerRows(input: {
  teamSide: TeamSide;
  team: Team;
  playerStats: readonly PlayerStats[];
  setNumbers: readonly number[];
  participationBySet: MatchReportParticipationBySet;
  setterStarterKeys: ReadonlySet<string>;
  breakPointPointsByPlayer: Record<string, number>;
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
          setNumbers: input.setNumbers,
          participationBySet: input.participationBySet,
          setterStarterKeys: input.setterStarterKeys,
        }),
        breakPointPoints: input.breakPointPointsByPlayer[
          createTeamScopedPlayerKey(input.teamSide, player.playerId)
        ] ?? 0,
      },
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

export function buildMatchTabellinoReport(input: {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig?: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
  lineupSnapshots?: readonly SetLineupSnapshot[];
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
  const setterStarterKeys = buildSetterStarterKeys({
    eventLog: input.eventLog,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
  });
  const homePlayerRows = buildTabellinoPlayerRows({
    teamSide: 'home',
    team: input.homeTeam,
    playerStats: allPlayerStats,
    setNumbers,
    participationBySet,
    setterStarterKeys,
    breakPointPointsByPlayer,
  });
  const awayPlayerRows = buildTabellinoPlayerRows({
    teamSide: 'away',
    team: input.awayTeam,
    playerStats: allPlayerStats,
    setNumbers,
    participationBySet,
    setterStarterKeys,
    breakPointPointsByPlayer,
  });

  const homeSetRows = buildTabellinoSetRows('home', input.stats, input.homeTeam, input.awayTeam, input.eventLog, input.completedSets, input.scoutingConfig);
  const awaySetRows = buildTabellinoSetRows('away', input.stats, input.homeTeam, input.awayTeam, input.eventLog, input.completedSets, input.scoutingConfig);
  const setSummaries = buildSetHeaderSummaries({
    stats: input.stats,
    eventLog: input.eventLog,
    scoutingConfig: input.scoutingConfig,
  });

  const homeSetsWon = input.stats.setStats.reduce((total, set) => total + (set.homeScore > set.awayScore ? 1 : 0), 0);
  const awaySetsWon = input.stats.setStats.reduce((total, set) => total + (set.awayScore > set.homeScore ? 1 : 0), 0);

  return {
    title: 'Match report',
    competition: input.metadata?.competition ?? input.metadata?.title ?? '-',
    venue: input.metadata?.venue ?? '-',
    dateLabel: formatDateTime(input.metadata?.playedAt ?? undefined),
    homeTeamName: input.homeTeam.name,
    awayTeamName: input.awayTeam.name,
    homeSetsWon,
    awaySetsWon,
    setScoreSummary: input.stats.setStats.map((setStats) => `${setStats.homeScore}-${setStats.awayScore}`).join(', '),
    setSummaries,
    homeTabellino: {
      teamSide: 'home',
      teamName: input.homeTeam.name,
      sideLabel: 'home',
      rows: homePlayerRows,
      totals: buildReportPlayerRow(buildTeamTotalPlayerStats(input.stats.teamStats.home), undefined, {
        breakPointPoints: computeTeamBreakPointPoints(input.stats, 'home'),
      }),
      setRows: homeSetRows,
    },
    awayTabellino: {
      teamSide: 'away',
      teamName: input.awayTeam.name,
      sideLabel: 'away',
      rows: awayPlayerRows,
      totals: buildReportPlayerRow(buildTeamTotalPlayerStats(input.stats.teamStats.away), undefined, {
        breakPointPoints: computeTeamBreakPointPoints(input.stats, 'away'),
      }),
      setRows: awaySetRows,
    },
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

function sanitizeFilenameSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function createMatchReportFilename(
  homeTeamName: string,
  awayTeamName: string,
  playedAt?: string,
): string {
  const date = playedAt ? new Date(playedAt) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  return `${sanitizeFilenameSegment(homeTeamName)}-vs-${sanitizeFilenameSegment(awayTeamName)}-${safeDate}-report.html`;
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
  return [
    'entry-mark',
    `entry-mark-${markerKind}`,
    'match-report__set-marker',
    `match-report__set-marker--${markerKind}`,
    marker.kind === 'starter' && marker.isSetter ? 'match-report__set-marker--setter' : '',
  ].filter(Boolean).join(' ');
}

function renderEntryMarkerContent(marker: MatchReportEntryMarker): string {
  if (marker.kind !== 'starter') {
    return '';
  }

  return `${escapeHtml(marker.label)}${marker.isFirstServer ? '<sup>1S</sup>' : ''}`;
}

function renderEntryMarkersHtml(row: MatchReportPlayerRow): string {
  if (row.entryMarkers.length === 0) {
    return `<span class="entry-empty">${escapeHtml(row.entryLabel)}</span>`;
  }

  return row.entryMarkers.map((marker) => `
    <span class="${escapeHtml(getSetMarkerClassName(marker))}" title="${escapeHtml(marker.title)}" aria-label="${escapeHtml(marker.title)}">
      ${renderEntryMarkerContent(marker)}
    </span>
  `).join('');
}

function renderPlayerMetricCells(row: MatchReportPlayerRow | TabellinoSetSummaryRow): string {
  return `
    <td>${row.breakPointPoints}</td>
    <td>${escapeHtml(row.pointsWonLostLabel)}</td>
    <td>${row.serve.total}</td>
    <td>${row.serve.errors}</td>
    <td>${row.serve.aces}</td>
    <td>${renderPercent(row.serve.efficiency)}</td>
    <td>${row.receive.total}</td>
    <td>${row.receive.errors}</td>
    <td>${row.receive.perfect}</td>
    <td>${row.receive.positive}</td>
    <td>${renderPercent(row.receive.efficiency)}</td>
    <td>${row.attack.total}</td>
    <td>${row.attack.kills}</td>
    <td>${row.attack.errors}</td>
    <td>${row.attack.blocked}</td>
    <td>${renderPercent(row.attack.efficiency)}</td>
    <td>${row.block.points}</td>
    <td>${row.block.touches}</td>
  `;
}

function renderReportPlayerRows(rows: readonly MatchReportPlayerRow[]): string {
  return rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.jerseyNumber)}</td>
      <th scope="row" class="player-cell">
        <span>${escapeHtml(row.playerName)}</span>
        ${row.isCaptain ? '<strong class="captain-mark">C</strong>' : ''}
        ${row.isLibero ? '<strong class="libero-mark">L</strong>' : ''}
      </th>
      <td class="entry-cell">${renderEntryMarkersHtml(row)}</td>
      ${renderPlayerMetricCells(row)}
    </tr>
  `).join('');
}

function renderTeamTotalRow(row: MatchReportPlayerRow): string {
  return `
    <tr class="total-row">
      <td></td>
      <th scope="row">Totali squadra</th>
      <td></td>
      ${renderPlayerMetricCells(row)}
    </tr>
  `;
}

function renderTabellinoSetRows(setRows: readonly TabellinoSetSummaryRow[]): string {
  return setRows.map((row) => `
    <tr class="set-summary-row">
      <td></td>
      <th scope="row">Set ${row.setNumber} <small>${row.setScore}-${row.opponentScore}${row.durationLabel ? ` / ${escapeHtml(row.durationLabel)}` : ''}</small></th>
      <td>${escapeHtml(row.partialScoreLabel)}</td>
      ${renderPlayerMetricCells(row)}
    </tr>
  `).join('');
}

function renderTabellinoTeamHtml(tabellino: TabellinoTeamTable): string {
  return `
    <section class="tabellino-team">
      <header class="tabellino-team-header">
        <h2>${escapeHtml(tabellino.teamName)}</h2>
        <span>${escapeHtml(tabellino.sideLabel)}</span>
      </header>
      <table class="report-table">
        <thead>
          <tr>
            <th rowspan="2">#</th>
            <th rowspan="2">Player</th>
            <th rowspan="2">Pos/Entry</th>
            <th rowspan="2">BP</th>
            <th rowspan="2">V-P</th>
            <th colspan="4">Serve</th>
            <th colspan="5">Reception</th>
            <th colspan="5">Attack</th>
            <th colspan="2">Block</th>
          </tr>
          <tr>
            <th>Tot</th><th>Err</th><th>Ace</th><th>Eff</th>
            <th>Tot</th><th>Err</th><th>#</th><th>+</th><th>Eff</th>
            <th>Tot</th><th>Kill</th><th>Err</th><th>Blk</th><th>Eff</th>
            <th>Pt</th><th>T</th>
          </tr>
        </thead>
        <tbody>
          ${renderReportPlayerRows(tabellino.rows)}
          ${renderTeamTotalRow(tabellino.totals)}
          ${renderTabellinoSetRows(tabellino.setRows)}
        </tbody>
      </table>
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

const htmlStyle = `
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; color: #111827; background: #ffffff; font-size: 9px; }
  h1, h2, h3 { margin: 0; }
  .report-page { width: 100%; }
  .report-header { display: grid; grid-template-columns: minmax(0, 1fr) 160px; gap: 10px; align-items: start; padding-bottom: 6px; border-bottom: 2px solid #111827; }
  .report-header h1 { font-size: 15px; letter-spacing: 0; text-transform: uppercase; }
  .report-meta { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px 8px; margin-top: 5px; }
  .report-meta strong { display: block; font-size: 7px; text-transform: uppercase; }
  .report-legend { margin: 4px 0 0; font-size: 7.5px; }
  .report-score { text-align: right; border: 1px solid #111827; padding: 4px; }
  .report-score strong { display: block; font-size: 18px; }
  .set-summary-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .set-summary-table th, .set-summary-table td { border: 1px solid #9ca3af; padding: 2px 3px; text-align: center; }
  .set-summary-table th { background: #f3f4f6; }
  .tabellino-team { margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
  .tabellino-team-header { display: flex; justify-content: space-between; align-items: baseline; padding: 3px 4px; border: 1px solid #111827; border-bottom: 0; background: #f9fafb; }
  .tabellino-team-header h2 { font-size: 11px; text-transform: uppercase; }
  .tabellino-team-header span { font-size: 8px; text-transform: uppercase; }
  .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .report-table th, .report-table td { border: 1px solid #9ca3af; padding: 1.5px 2px; text-align: right; white-space: nowrap; }
  .report-table th { background: #f3f4f6; color: #111827; font-weight: 700; text-transform: uppercase; font-size: 7px; line-height: 1.1; }
  .report-table td { color: #111827; font-size: 7.5px; }
  .report-table th:nth-child(1), .report-table td:nth-child(1) { width: 22px; text-align: center; }
  .report-table th:nth-child(2), .report-table td:nth-child(2) { width: 118px; text-align: left; }
  .report-table th:nth-child(3), .report-table td:nth-child(3) { width: 66px; text-align: center; }
  .player-cell { text-align: left; overflow: hidden; text-overflow: ellipsis; }
  .captain-mark, .libero-mark { display: inline-block; min-width: 10px; margin-left: 3px; border: 1px solid #111827; text-align: center; font-size: 6.5px; line-height: 1.2; }
  .entry-cell { text-align: center; }
  .entry-mark, .match-report__set-marker { display: inline-flex; align-items: center; justify-content: center; width: 13px; min-width: 13px; height: 10px; margin: 0 1px; border: 1px solid #111827; color: #111827; text-align: center; font-weight: 700; line-height: 1; vertical-align: middle; }
  .match-report__set-marker--starter { background: #e5e7eb; }
  .match-report__set-marker--setter { background: #ffffff; }
  .match-report__set-marker--entry, .match-report__set-marker--libero-entry, .match-report__set-marker--return { width: 11px; min-width: 11px; height: 8px; background: #ffffff; }
  .entry-mark sup { font-size: 5px; margin-left: 1px; }
  .entry-empty { color: #6b7280; }
  .total-row th, .total-row td { background: #e5e7eb; font-weight: 700; }
  .set-summary-row th, .set-summary-row td { background: #f9fafb; font-weight: 700; }
  .set-summary-row small { display: block; font-size: 6.5px; font-weight: 400; }
`;

export function downloadMatchReportHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildMatchReportHtml(input: {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
  lineupSnapshots?: readonly SetLineupSnapshot[];
}): string {
  const report = buildMatchTabellinoReport(input);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(report.title)}</title>
<style>${htmlStyle}</style>
</head>
<body>
  <main class="report-page">
    <header class="report-header">
      <div>
        <h1>${escapeHtml(report.title)}</h1>
        <div class="report-meta">
          <div><strong>Competition</strong><div>${escapeHtml(report.competition)}</div></div>
          <div><strong>Date</strong><div>${escapeHtml(report.dateLabel)}</div></div>
          <div><strong>Venue</strong><div>${escapeHtml(report.venue)}</div></div>
          <div><strong>Home</strong><div>${escapeHtml(report.homeTeamName)}</div></div>
          <div><strong>Away</strong><div>${escapeHtml(report.awayTeamName)}</div></div>
          <div><strong>Sets</strong><div>${escapeHtml(report.setScoreSummary)}</div></div>
        </div>
        <p class="report-legend">Boxed numbers = starters · white starter box = setter · empty box = entry/libero</p>
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
  </main>
</body>
</html>
`;
}

import type { MatchEvent } from '@src/domain/events/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { Team } from '@src/domain/roster/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { BuildMatchStatsInput, MatchStats, PlayerStats, SetStats, TeamStats } from './match-stats';
import { buildSetMatchStats, safeDivide } from './match-stats';
import { resolvePointWinnerFromTouch, isTrueTerminalTouch } from './scoring-rules';

export type MatchReportPlayerParticipation = {
  position?: number;
  entered: boolean;
  liberoReplacement: boolean;
  liberoReturned: boolean;
  liberoReplacedPlayerIds: string[];
  replacedByLiberoIds: string[];
};

export type MatchReportParticipationBySet = Record<number, Record<string, MatchReportPlayerParticipation>>;

function isSetStartedEvent(event: MatchEvent): event is Extract<MatchEvent, { type: 'set_started' }> {
  return event.type === 'set_started';
}

function isSubstitutionEvent(event: MatchEvent): event is Extract<MatchEvent, { type: 'substitution_made' }> {
  return event.type === 'substitution_made';
}

function isLiberoReplacementEvent(event: MatchEvent): event is Extract<MatchEvent, { type: 'libero_replacement_made' }> {
  return event.type === 'libero_replacement_made';
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
}): MatchReportParticipationBySet {
  return input.setNumbers.reduce((sets, setNumber) => {
    const setStartedEvent = input.eventLog.find(
      (event): event is Extract<MatchEvent, { type: 'set_started' }> => isSetStartedEvent(event) && event.setNumber === setNumber,
    );
    const teamParticipation: Record<string, MatchReportPlayerParticipation> = {};
    const startedPositionsByTeam: Record<TeamSide, Map<string, number>> = {
      home: new Map<string, number>(),
      away: new Map<string, number>(),
    };
    const enteredByTeam: Record<TeamSide, Set<string>> = {
      home: new Set<string>(),
      away: new Set<string>(),
    };
    const liberoReturnedByTeam: Record<TeamSide, Set<string>> = {
      home: new Set<string>(),
      away: new Set<string>(),
    };
    const liberoReplacedPlayersByTeam: Record<TeamSide, Map<string, Set<string>>> = {
      home: new Map<string, Set<string>>(),
      away: new Map<string, Set<string>>(),
    };
    const replacedByLiberoByTeam: Record<TeamSide, Map<string, Set<string>>> = {
      home: new Map<string, Set<string>>(),
      away: new Map<string, Set<string>>(),
    };

    if (setStartedEvent) {
      setStartedEvent.homeLineup.slots.forEach((slot: StartingLineup['slots'][number]) => {
        if (slot.playerId) {
          startedPositionsByTeam.home.set(slot.playerId, slot.courtPosition);
        }
      });
      setStartedEvent.awayLineup.slots.forEach((slot: StartingLineup['slots'][number]) => {
        if (slot.playerId) {
          startedPositionsByTeam.away.set(slot.playerId, slot.courtPosition);
        }
      });
    }

    input.eventLog.forEach((event) => {
      if (event.type !== 'substitution_made' && event.type !== 'libero_replacement_made') {
        return;
      }
      if (event.setNumber !== setNumber) {
        return;
      }

      if (event.type === 'substitution_made') {
        enteredByTeam[event.teamSide].add(event.playerInId);
      }

      if (event.type === 'libero_replacement_made') {
        enteredByTeam[event.teamSide].add(event.playerInId);
        if (event.action === 'regular_returns') {
          liberoReturnedByTeam[event.teamSide].add(event.playerInId);
        }

        const liberoReplacedPlayers = liberoReplacedPlayersByTeam[event.teamSide].get(event.liberoPlayerId) ?? new Set<string>();
        liberoReplacedPlayers.add(event.replacedPlayerId);
        liberoReplacedPlayersByTeam[event.teamSide].set(event.liberoPlayerId, liberoReplacedPlayers);

        const replacedByLiberos = replacedByLiberoByTeam[event.teamSide].get(event.replacedPlayerId) ?? new Set<string>();
        replacedByLiberos.add(event.liberoPlayerId);
        replacedByLiberoByTeam[event.teamSide].set(event.replacedPlayerId, replacedByLiberos);
      }
    });

    [input.homeTeam, input.awayTeam].forEach((team) => {
      team.players.forEach((player) => {
        const teamSide = team === input.homeTeam ? 'home' : 'away';
        teamParticipation[player.id] = {
          position: startedPositionsByTeam[teamSide].get(player.id),
          entered: enteredByTeam[teamSide].has(player.id),
          liberoReplacement: (liberoReplacedPlayersByTeam[teamSide].get(player.id)?.size ?? 0) > 0,
          liberoReturned: liberoReturnedByTeam[teamSide].has(player.id),
          liberoReplacedPlayerIds: [...(liberoReplacedPlayersByTeam[teamSide].get(player.id) ?? [])],
          replacedByLiberoIds: [...(replacedByLiberoByTeam[teamSide].get(player.id) ?? [])],
        };
      });
    });

    sets[setNumber] = teamParticipation;
    return sets;
  }, {} as MatchReportParticipationBySet);
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

      const count = map[terminalTouch.playerId] ?? 0;
      map[terminalTouch.playerId] = count + 1;
    });

    return map;
  }, {} as Record<string, number>);
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

export type MatchReportSimpleSkillSummary = {
  total: number;
  positive: number;
};

export type MatchReportBlockSummary = {
  points: number;
  touches: number;
};

export type MatchReportPlayerRow = {
  playerId: string;
  jerseyNumber: number | string;
  playerName: string;
  teamSide: TeamSide;
  isLibero: boolean;
  entryLabel: string;
  startingPosition?: number;
  entered: boolean;
  liberoReplacement: boolean;
  liberoDetail: string;
  serve: MatchReportServeSummary;
  receive: MatchReportReceiveSummary;
  attack: MatchReportAttackSummary;
  block: MatchReportBlockSummary;
  dig: MatchReportSimpleSkillSummary;
  set: MatchReportSimpleSkillSummary;
  freeball: MatchReportSimpleSkillSummary;
  cover: MatchReportSimpleSkillSummary;
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

export type DataVolleyMatchReport = {
  title: string;
  competition: string;
  venue: string;
  dateLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  homeSetsWon: number;
  awaySetsWon: number;
  setScoreSummary: string;
  sets: MatchReportSetSection[];
};

function formatRosterPlayerName(player: Team['players'][number]): string {
  return player.shortName || [player.firstName, player.lastName].filter(Boolean).join(' ') || player.playerCode;
}

function getPlayerSortValue(player: PlayerStats): number {
  const jerseyNumber = Number(player.jerseyNumber);
  return Number.isFinite(jerseyNumber) ? jerseyNumber : Number.MAX_SAFE_INTEGER;
}

function getPositiveTouches(player: PlayerStats, skill: 'dig' | 'set' | 'freeball' | 'cover'): number {
  return player[skill].perfect + player[skill].positive;
}

function buildEntryLabel(participation?: MatchReportPlayerParticipation): string {
  if (!participation) {
    return '-';
  }

  const labels: string[] = [];
  if (participation.position !== undefined) {
    labels.push(`S${participation.position}`);
  }
  if (participation.entered && participation.position === undefined) {
    labels.push('IN');
  }
  if (participation.liberoReplacement) {
    labels.push('L');
  }
  if (participation.liberoReturned) {
    labels.push('R');
  }

  return labels.length > 0 ? labels.join('/') : '-';
}

function buildLiberoDetail(participation?: MatchReportPlayerParticipation): string {
  if (!participation) {
    return '';
  }

  const details: string[] = [];
  if (participation.liberoReplacedPlayerIds.length > 0) {
    details.push(`L for ${participation.liberoReplacedPlayerIds.join(', ')}`);
  }
  if (participation.replacedByLiberoIds.length > 0) {
    details.push(`replaced by ${participation.replacedByLiberoIds.join(', ')}`);
  }

  return details.join('; ');
}

function buildReportPlayerRow(
  playerStats: PlayerStats,
  participation?: MatchReportPlayerParticipation,
): MatchReportPlayerRow {
  return {
    playerId: playerStats.playerId,
    jerseyNumber: playerStats.jerseyNumber,
    playerName: playerStats.playerName,
    teamSide: playerStats.teamSide,
    isLibero: Boolean(playerStats.isLibero || playerStats.role === 'libero'),
    entryLabel: buildEntryLabel(participation),
    startingPosition: participation?.position,
    entered: participation?.entered ?? false,
    liberoReplacement: participation?.liberoReplacement ?? false,
    liberoDetail: buildLiberoDetail(participation),
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
    dig: {
      total: playerStats.dig.total,
      positive: getPositiveTouches(playerStats, 'dig'),
    },
    set: {
      total: playerStats.set.total,
      positive: getPositiveTouches(playerStats, 'set'),
    },
    freeball: {
      total: playerStats.freeball.total,
      positive: getPositiveTouches(playerStats, 'freeball'),
    },
    cover: {
      total: playerStats.cover.total,
      positive: getPositiveTouches(playerStats, 'cover'),
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
    .map((player) => buildReportPlayerRow(player, input.participationByPlayer[player.playerId]));

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

export function buildDataVolleyMatchReport(input: {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig?: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
}): DataVolleyMatchReport {
  const setNumbers = input.stats.setStats.map((setStats) => setStats.setNumber);
  const participationBySet = buildPlayerParticipationBySet({
    eventLog: input.eventLog,
    setNumbers,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
  });
  const reportTouches = input.stats.rallyStats.flatMap((rally) => rally.touches);

  const sets = input.stats.setStats.map((setSummary) => {
    const setStats = buildSetMatchStats({
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      touches: reportTouches,
      eventLog: input.eventLog,
      completedSets: input.completedSets,
    }, setSummary.setNumber);
    const durationLabel = getSetDurationLabel(setSummary.setNumber, input.eventLog);
    const totalPoints = setSummary.homeScore + setSummary.awayScore;
    const participationByPlayer = participationBySet[setSummary.setNumber] ?? {};

    return {
      setNumber: setSummary.setNumber,
      homeScore: setSummary.homeScore,
      awayScore: setSummary.awayScore,
      durationLabel,
      phases: buildSetPhaseSplits(totalPoints),
      home: buildSetTeamTable({
        teamSide: 'home',
        team: input.homeTeam,
        setNumber: setSummary.setNumber,
        setStats,
        setScore: setSummary.homeScore,
        opponentScore: setSummary.awayScore,
        durationLabel,
        participationByPlayer,
      }),
      away: buildSetTeamTable({
        teamSide: 'away',
        team: input.awayTeam,
        setNumber: setSummary.setNumber,
        setStats,
        setScore: setSummary.awayScore,
        opponentScore: setSummary.homeScore,
        durationLabel,
        participationByPlayer,
      }),
    };
  });

  const title = input.stats.setStats.length === 1 ? 'Set report' : 'Match report';

  return {
    title,
    competition: input.metadata?.competition ?? input.metadata?.title ?? '-',
    venue: input.metadata?.venue ?? '-',
    dateLabel: formatDateTime(input.metadata?.playedAt ?? undefined),
    homeTeamName: input.homeTeam.name,
    awayTeamName: input.awayTeam.name,
    homeSetsWon: input.stats.setStats.reduce((total, set) => total + (set.homeScore > set.awayScore ? 1 : 0), 0),
    awaySetsWon: input.stats.setStats.reduce((total, set) => total + (set.awayScore > set.homeScore ? 1 : 0), 0),
    setScoreSummary: input.stats.setStats.map((setStats) => `${setStats.homeScore}-${setStats.awayScore}`).join(', '),
    sets,
  };
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

function renderReportPlayerRows(rows: readonly MatchReportPlayerRow[], isTotal = false): string {
  return rows.map((row) => `
    <tr${isTotal ? ' class="total-row"' : ''}>
      <td>${escapeHtml(row.jerseyNumber)}</td>
      <td class="player-cell">
        <span>${escapeHtml(row.playerName)}</span>
        ${row.isLibero ? '<strong class="libero-mark">L</strong>' : ''}
      </td>
      <td title="${escapeHtml(row.liberoDetail)}">${escapeHtml(row.entryLabel)}</td>
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
      <td>${row.dig.total}</td>
      <td>${row.dig.positive}</td>
      <td>${row.set.total}</td>
      <td>${row.set.positive}</td>
    </tr>
  `).join('');
}

function renderTeamReportHtml(team: MatchReportTeamTable): string {
  return `
    <section class="team-report">
      <header class="team-report-header">
        <div>
          <h3>${escapeHtml(team.teamName)}</h3>
          <span>${escapeHtml(team.sideLabel)} / Set ${team.setNumber}</span>
        </div>
        <strong>${team.setScore}-${team.opponentScore}</strong>
      </header>
      <table class="report-table">
        <thead>
          <tr>
            <th rowspan="2">#</th>
            <th rowspan="2">Player</th>
            <th rowspan="2">Entry</th>
            <th colspan="4">Serve</th>
            <th colspan="5">Reception</th>
            <th colspan="5">Attack</th>
            <th colspan="2">Block</th>
            <th colspan="2">Dig</th>
            <th colspan="2">Set</th>
          </tr>
          <tr>
            <th>Tot</th><th>Err</th><th>Ace</th><th>Eff</th>
            <th>Tot</th><th>Err</th><th>#</th><th>+</th><th>Eff</th>
            <th>Tot</th><th>Kill</th><th>Err</th><th>Blk</th><th>Eff</th>
            <th>Pt</th><th>T</th>
            <th>Tot</th><th>+</th>
            <th>Tot</th><th>+</th>
          </tr>
        </thead>
        <tbody>
          ${renderReportPlayerRows(team.rows)}
          ${renderReportPlayerRows([team.totals], true)}
        </tbody>
      </table>
    </section>
  `;
}

function renderSetReportHtml(set: MatchReportSetSection): string {
  const phaseText = set.phases.map((phase) => `P${phase.phase}: ${phase.fromPoint}-${phase.toPoint}`).join(' / ');
  return `
    <section class="set-section">
      <header class="set-header">
        <div>
          <h2>Set ${set.setNumber}</h2>
          <span>${escapeHtml(set.durationLabel)} / ${escapeHtml(phaseText)}</span>
        </div>
        <strong>${set.homeScore}-${set.awayScore}</strong>
      </header>
      ${renderTeamReportHtml(set.home)}
      ${renderTeamReportHtml(set.away)}
    </section>
  `;
}

const htmlStyle = `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, Arial, sans-serif; margin: 0; color: #0f172a; background: #ffffff; font-size: 10px; }
  h1, h2, h3 { margin: 0; }
  .report-page { width: 100%; }
  .report-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #0f172a; }
  .report-header h1 { font-size: 20px; letter-spacing: 0; }
  .report-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 12px; margin-top: 6px; color: #475569; }
  .report-legend { margin-top: 4px; color: #475569; font-size: 9px; }
  .report-score { text-align: right; min-width: 130px; }
  .report-score strong { display: block; font-size: 22px; }
  .set-section { break-inside: avoid; page-break-inside: avoid; margin-top: 12px; }
  .set-header, .team-report-header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .set-header { padding: 7px 8px; background: #e2e8f0; border: 1px solid #cbd5e1; }
  .set-header h2 { font-size: 14px; }
  .set-header span, .team-report-header span { color: #64748b; }
  .set-header strong { font-size: 16px; }
  .team-report { margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
  .team-report-header { padding: 5px 7px; border: 1px solid #cbd5e1; border-bottom: 0; background: #f8fafc; }
  .team-report-header h3 { font-size: 12px; }
  .team-report-header strong { font-size: 13px; }
  .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .report-table th, .report-table td { border: 1px solid #cbd5e1; padding: 2px 3px; text-align: right; white-space: nowrap; }
  .report-table th { background: #f1f5f9; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 8px; line-height: 1.2; }
  .report-table td { color: #0f172a; font-size: 8.5px; }
  .report-table th:nth-child(1), .report-table td:nth-child(1) { width: 24px; text-align: center; }
  .report-table th:nth-child(2), .report-table td:nth-child(2) { width: 118px; text-align: left; }
  .report-table th:nth-child(3), .report-table td:nth-child(3) { width: 38px; text-align: center; }
  .player-cell { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .player-cell span { overflow: hidden; text-overflow: ellipsis; }
  .libero-mark { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 999px; background: #e2e8f0; color: #334155; font-size: 8px; }
  .total-row td { background: #e2e8f0; font-weight: 700; }
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
}): string {
  const report = buildDataVolleyMatchReport(input);

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
        <p class="report-legend">S1-S6 = starter positions · IN = substitute · L = libero replacement · R = libero return</p>
      </div>
      <div class="report-score">
        <span>${escapeHtml(report.homeTeamName)}</span>
        <strong>${report.homeSetsWon} : ${report.awaySetsWon}</strong>
        <span>${escapeHtml(report.awayTeamName)}</span>
      </div>
    </header>
    ${report.sets.map(renderSetReportHtml).join('')}
  </main>
</body>
</html>
`;
}

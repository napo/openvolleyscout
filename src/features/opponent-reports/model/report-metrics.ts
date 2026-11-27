/**
 * Metrics of an opponent report, over the selected matches of ONE team.
 * Everything is counted from the opponent's point of view. Pure module.
 */
import type { DataVolleyCodeTables } from '../../../domain/match/code-tables';
import { receptionZone } from '@src/features/analytics/serve-attributes';
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchVideoAnalysis } from '@src/domain/video/types';
import { createEmptySkillStats, updateSkillStats, type RallyStats, type RotationStats, type SkillStats } from '@src/features/scouting/model/match-stats';
import { getActiveIndicators } from '@src/features/scouting/model/indicator-settings';
import { extractSideOutSequences } from '../../analytics/sideout/sideout-distribution';
import { computeSituationMetrics } from '../../analytics/dashboard/situation/situation-metrics';
import { computeRallyExchangeStats } from '../../analytics/dashboard/situation/rally-exchange-metrics';
import { buildTouchCourtContext, collectSetterPlayerIds, isFrontRow, type CourtPosition, type TouchCourtContext } from './court-context';

export const ROTATIONS: readonly CourtPosition[] = [1, 6, 5, 4, 3, 2];
export const FIRST_BALL_EVALUATIONS = ['#', '+', '!', '-'] as const;
export type FirstBallEvaluation = (typeof FIRST_BALL_EVALUATIONS)[number];

/** One selected match, already reduced to what the metrics need. */
export interface ReportMatchInput {
  matchId: string;
  /** Side the opponent plays on. */
  side: TeamSide;
  events: readonly MatchEvent[];
  rallies: readonly RallyStats[];
  /** Per-rotation side-out/break-point of the opponent in this match. */
  rotationStats: readonly RotationStats[];
  /** The opponent's roster in this match. */
  roster: readonly MatchRosterPlayer[];
  /** Video source and sync settings, used only to create optional share links. */
  videoAnalysis?: MatchVideoAnalysis;
  /** The match's DataVolley combination table (for the served attacker of the zone analysis). */
  codeTables?: DataVolleyCodeTables;
  /** When the match was played: orders the matches for "the latest matches". */
  playedAt?: string;
  /** The team faced in that match. */
  facedName?: string;
}

export interface Ratio {
  count: number;
  total: number;
  /** count / total; null when total is 0. */
  rate: number | null;
}

export interface ReportPlayer {
  /** Stable across matches: the archived player when linked, else jersey + name. */
  key: string;
  jersey: string;
  name: string;
}

export interface AttackOutcome {
  /** Possessions counted. */
  total: number;
  /** First attack scored a point. */
  kill: Ratio;
  /** The rally was won (side-out). */
  sideOut: Ratio;
}

export interface ReceiverMetrics {
  player: ReportPlayer;
  receptions: number;
  /** # and + receptions. */
  positive: Ratio;
  perfect: Ratio;
  errors: Ratio;
}

export interface RotationMetrics {
  rotation: CourtPosition;
  sideOut: Ratio;
  breakPoint: Ratio;
  receptionPositive: Ratio;
}

export interface FirstBallMetrics {
  evaluation: FirstBallEvaluation;
  receptions: number;
  /** First attack after this reception scored. */
  kill: Ratio;
  /** First attack after this reception was an error or was blocked. */
  attackLost: Ratio;
  sideOut: Ratio;
}

export interface PlayerErrorMetrics {
  player: ReportPlayer;
  serve: Ratio;
  attack: Ratio;
}

export interface AttackerMetrics {
  player: ReportPlayer;
  attacks: number;
  kill: Ratio;
  errors: Ratio;
  /** Attack efficiency with the winning and losing effects chosen in Settings > Analysis. */
  efficiency: number | null;
}

export interface ServeTarget {
  sideOut?: Ratio;
  comparison?: Ratio;
  rotation: CourtPosition;
  player: ReportPlayer;
  /** The target's reception over the whole sample. */
  positive: Ratio;
  /** Her receptions in that rotation. */
  inRotation: Ratio;
  /** Where she received most often in that rotation (DataVolley zone 1-9), with its share. */
  zone: string | null;
  zoneShare: number | null;
  /** Actions supporting the most frequent recorded arrival zone. */
  zoneActions?: number;
}

/** Who stood in each court position when the opponent received in a rotation. */
export interface ReceptionLineupSlot {
  position: CourtPosition;
  /** Who stood there in the most frequent line-up; null when unknown. */
  player: ReportPlayer | null;
  /** Share of that rotation's receptions played with this exact line-up. */
  share: number;
}

export interface StartingRotationRow {
  matchId: string;
  setNumber: number;
  rotation: CourtPosition | null;
  serving: boolean;
}

/** Average exchanges needed to win a point, and the points it is averaged over. */
export interface ExchangeLength {
  points: number;
  average: number | null;
}

/** Whole-team rally indicators of the opponent, same definitions as the dashboard. */
export interface TeamIndicators {
  sideOut: Ratio;
  firstBallSideOut: Ratio;
  firstBallPlay: Ratio;
  breakPoint: Ratio;
  attackAfterDigKill: Ratio;
  counterattack: Ratio;
  sideOutLength: ExchangeLength;
  breakPointLength: ExchangeLength;
}

/** Sums the dashboard's situation and exchange metrics of the opponent over the matches. */
export function computeTeamIndicators(matches: readonly Pick<ReportMatchInput, 'side' | 'rallies'>[]): TeamIndicators {
  const sums = { sideOut: [0, 0], firstBallSideOut: [0, 0], firstBallPlay: [0, 0], breakPoint: [0, 0], attackAfterDigKill: [0, 0], counterattack: [0, 0] };
  const lengths = { sideOut: [0, 0], breakPoint: [0, 0] };
  for (const match of matches) {
    const situation = computeSituationMetrics(match.rallies, '', '')[match.side];
    for (const key of Object.keys(sums) as Array<keyof typeof sums>) {
      sums[key][0] += situation[key].pointsWon;
      sums[key][1] += situation[key].attempts;
    }
    const exchanges = computeRallyExchangeStats(match.rallies, '', '')[match.side];
    for (const key of ['sideOut', 'breakPoint'] as const) {
      lengths[key][0] += exchanges[key].totalExchanges;
      lengths[key][1] += exchanges[key].points;
    }
  }
  const length = ([exchanges, points]: number[]): ExchangeLength => ({ points, average: points > 0 ? exchanges / points : null });
  return {
    sideOut: ratio(sums.sideOut[0], sums.sideOut[1]),
    firstBallSideOut: ratio(sums.firstBallSideOut[0], sums.firstBallSideOut[1]),
    firstBallPlay: ratio(sums.firstBallPlay[0], sums.firstBallPlay[1]),
    breakPoint: ratio(sums.breakPoint[0], sums.breakPoint[1]),
    attackAfterDigKill: ratio(sums.attackAfterDigKill[0], sums.attackAfterDigKill[1]),
    counterattack: ratio(sums.counterattack[0], sums.counterattack[1]),
    sideOutLength: length(lengths.sideOut),
    breakPointLength: length(lengths.breakPoint),
  };
}

export interface OpponentReportMetrics {
  sample: { matches: number; sets: number; rallies: number };
  /** Touches of every skill per player (ReportPlayer.key): ranks the setters in the report. */
  touchesByPlayer?: Record<string, number>;
  /** Athletes who played (a touch, or in a starting line-up), by jersey, with the role of the roster. */
  teamPlayers?: Array<{ player: ReportPlayer; role?: string; libero: boolean; matches: number }>;
  /** Starting rotations in the latest matches only (up to four, by date): breaks ties on the Team page. */
  recentStartingRotationCounts?: { matches: number; counts: Record<CourtPosition, { serve: number; receive: number }> };
  /** Skills of each athlete of the analysed team (ReportPlayer.key): the Team page statistics. */
  playerSkills?: Record<string, { serve: SkillStats; receive: SkillStats; attack: SkillStats; block: SkillStats; dig: SkillStats }>;
  /**
   * The six that started most sets together, turned so the setter is in zone 1 (slots[0] = zone 1 ... slots[5] = zone 6),
   * and the libero: one, or two when one receives and the other defends.
   */
  startingLineup?: {
    sets: number;
    totalSets: number;
    slots: ReportPlayer[];
    liberos: Array<{ player: ReportPlayer; use: 'both' | 'reception' | 'defence' }>;
  };
  /** The analysed matches, oldest first: who was faced and when. */
  matchList?: Array<{ matchId: string; facedName?: string; playedAt?: string }>;
  /** Optional so older fixtures and stored metrics stay valid. */
  teamIndicators?: TeamIndicators;
  startingRotations: StartingRotationRow[];
  /** Times each rotation started a set, serving or receiving. */
  startingRotationCounts: Record<CourtPosition, { serve: number; receive: number }>;
  rotations: RotationMetrics[];
  receivers: ReceiverMetrics[];
  /** Rally outcome following each receiver, compared with other receivers in the same rotation. */
  receiverSideOut?: Array<{ player: ReportPlayer; rotation: CourtPosition; sideOut: Ratio; others: Ratio }>;
  receptionTeam: { positive: Ratio; errors: Ratio };
  firstBall: FirstBallMetrics[];
  positiveReception: {
    all: AttackOutcome;
    receiverFrontRow: AttackOutcome;
    receiverBackRow: AttackOutcome;
    /** Front-row receiver who also hit the first attack. */
    frontRowReceiverAttacks: AttackOutcome;
    /** Front-row receiver, someone else hit the first attack. */
    frontRowReceiverOtherAttacks: AttackOutcome;
  };
  attackers: AttackerMetrics[];
  errors: PlayerErrorMetrics[];
  teamErrors: { serve: Ratio; attack: Ratio };
  serveTargets: ServeTarget[];
  /** Reception line-up per rotation (only rotations with receptions). */
  receptionLineups: Array<{ rotation: CourtPosition; receptions: number; slots: ReceptionLineupSlot[] }>;
}

export function ratio(count: number, total: number): Ratio {
  return { count, total, rate: total > 0 ? count / total : null };
}

const EMPTY_COUNTS = (): Record<CourtPosition, { serve: number; receive: number }> => ({
  1: { serve: 0, receive: 0 },
  2: { serve: 0, receive: 0 },
  3: { serve: 0, receive: 0 },
  4: { serve: 0, receive: 0 },
  5: { serve: 0, receive: 0 },
  6: { serve: 0, receive: 0 },
});

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function toReportPlayer(player: MatchRosterPlayer): ReportPlayer {
  const rawName = [player.firstName, player.lastName].filter(Boolean).join(' ').trim();
  const jersey = String(player.jerseyNumber ?? '').trim();
  const fallbackName = jersey ? `#${jersey}` : (player.id || '?');
  const name = rawName || fallbackName;
  const keySuffix = normalizeName(player.lastName || rawName) || player.id || '?';
  return {
    key: player.archivedPlayerId ?? `#${jersey}|${keySuffix}`,
    jersey,
    name,
  };
}

export { receptionZone };

const isPositive = (evaluation: SkillEvaluation | undefined) => evaluation === '#' || evaluation === '+';

class Counter {
  count = 0;
  total = 0;
  add(hit: boolean) {
    this.total += 1;
    if (hit) this.count += 1;
  }
  get value(): Ratio {
    return ratio(this.count, this.total);
  }
}

class OutcomeCounter {
  kill = new Counter();
  sideOut = new Counter();
  add(attack: BallTouch | null, rallyWon: boolean | null) {
    this.kill.add(attack?.evaluation === '#');
    this.sideOut.add(rallyWon === true);
  }
  get value(): AttackOutcome {
    return { total: this.kill.total, kill: this.kill.value, sideOut: this.sideOut.value };
  }
}

function mapOf<K, V>(create: () => V) {
  const map = new Map<K, V>();
  return {
    map,
    get(key: K): V {
      let value = map.get(key);
      if (value === undefined) {
        value = create();
        map.set(key, value);
      }
      return value;
    },
  };
}

export interface MetricsOptions {
  /** Serve targets are chosen among receivers with at least this many receptions. */
  minReceptions?: number;
}

const BACK_ROW_INDICES: readonly number[] = [5, 4, 0];

function applyLiberoToReceptionLineup(
  rotation: CourtPosition,
  keys: ReadonlyArray<string | null>,
  liberoKeys: ReadonlySet<string>,
  middleBlockerKeys: ReadonlySet<string>,
  playerRoles: ReadonlyMap<string, string>,
  rotationReceptions: ReadonlyMap<string, { positive: Counter }> | undefined,
  overallReceptions: ReadonlyMap<string, { positive: Counter }>,
): Array<string | null> {
  if (liberoKeys.size === 0) return [...keys];
  if (keys.some((key) => key !== null && liberoKeys.has(key))) return [...keys];

  const rotRec = (key: string | null): number => (key ? rotationReceptions?.get(key)?.positive.total ?? 0 : 0);
  const allRec = (key: string | null): number => (key ? overallReceptions.get(key)?.positive.total ?? 0 : 0);

  const liberoKey = [...liberoKeys].sort(
    (left, right) => (rotRec(right) - rotRec(left)) || (allRec(right) - allRec(left)),
  )[0];
  if (!liberoKey) return [...keys];

  const liberoRotRec = rotRec(liberoKey);
  const liberoAllRec = allRec(liberoKey);
  const backRowIndices = BACK_ROW_INDICES.filter((index) => index + 1 !== rotation);

  const middleIndices = backRowIndices
    .filter((index) => {
      const key = keys[index];
      return key !== null && middleBlockerKeys.has(key);
    })
    .sort((left, right) => (rotRec(keys[left]) - rotRec(keys[right])) || (allRec(keys[left]) - allRec(keys[right])));

  if (middleIndices.length > 0) {
    const mbIndex = middleIndices[0];
    const mbRotRec = rotRec(keys[mbIndex]);
    if (mbRotRec === 0 || liberoRotRec >= mbRotRec) {
      const next = [...keys];
      next[mbIndex] = liberoKey;
      return next;
    }
    return [...keys];
  }

  const rolePriority = (key: string | null): number => {
    if (!key) return 0;
    const role = playerRoles.get(key);
    if (role === 'opposite') return 1;
    if (role === 'outside_hitter') return 2;
    return 0;
  };

  const zeroRotCandidates = backRowIndices
    .filter((index) => rotRec(keys[index]) === 0)
    .sort((left, right) => (
      (allRec(keys[left]) - allRec(keys[right]))
      || (rolePriority(keys[left]) - rolePriority(keys[right]))
    ));

  if (zeroRotCandidates.length === 0) return [...keys];

  const targetIndex = zeroRotCandidates[0];
  const targetAllRec = allRec(keys[targetIndex]);
  if (liberoRotRec > 0 || targetAllRec === 0 || liberoAllRec > 0) {
    const next = [...keys];
    next[targetIndex] = liberoKey;
    return next;
  }

  return [...keys];
}

export function computeOpponentReportMetrics(
  matches: readonly ReportMatchInput[],
  { minReceptions = 0 }: MetricsOptions = {},
): OpponentReportMetrics {
  const players = new Map<string, ReportPlayer>();
  const liberoKeys = new Set<string>();
  const middleBlockerKeys = new Set<string>();
  const playerRoles = new Map<string, string>();
  const startingRotations: StartingRotationRow[] = [];
  const startingRotationCounts = EMPTY_COUNTS();
  const rotationTotals = mapOf<CourtPosition, { soWins: number; soAttempts: number; bpWins: number; bpAttempts: number; reception: Counter }>(
    () => ({ soWins: 0, soAttempts: 0, bpWins: 0, bpAttempts: 0, reception: new Counter() }),
  );
  const receivers = mapOf<string, { positive: Counter; perfect: Counter; errors: Counter }>(
    () => ({ positive: new Counter(), perfect: new Counter(), errors: new Counter() }),
  );
  const teamReception = { positive: new Counter(), errors: new Counter() };
  const firstBall = mapOf<FirstBallEvaluation, { kill: Counter; attackLost: Counter; sideOut: Counter }>(
    () => ({ kill: new Counter(), attackLost: new Counter(), sideOut: new Counter() }),
  );
  const positive = {
    all: new OutcomeCounter(),
    receiverFrontRow: new OutcomeCounter(),
    receiverBackRow: new OutcomeCounter(),
    frontRowReceiverAttacks: new OutcomeCounter(),
    frontRowReceiverOtherAttacks: new OutcomeCounter(),
  };
  const attackers = mapOf<string, { kill: Counter; errors: Counter; skillStats: SkillStats }>(() => ({ kill: new Counter(), errors: new Counter(), skillStats: createEmptySkillStats() }));
  const errors = mapOf<string, { serve: Counter; attack: Counter }>(() => ({ serve: new Counter(), attack: new Counter() }));
  const touchCounts = new Map<string, number>();
  const playerSkills = mapOf<string, { serve: SkillStats; receive: SkillStats; attack: SkillStats; block: SkillStats; dig: SkillStats }>(() => ({
    serve: createEmptySkillStats(), receive: createEmptySkillStats(), attack: createEmptySkillStats(), block: createEmptySkillStats(), dig: createEmptySkillStats(),
  }));
  // Starting six as a whole, turned to the setter in zone 1 -> sets started.
  const lineupStarts = new Map<string, { keys: string[]; count: number }>();
  let setsWithSetter = 0;
  // Player key -> matches in which she played (a touch, or in a starting line-up).
  const playedMatches = new Map<string, Set<string>>();
  const markPlayed = (key: string, matchId: string) => playedMatches.set(key, (playedMatches.get(key) ?? new Set()).add(matchId));
  const teamErrors = { serve: new Counter(), attack: new Counter() };
  // rotation -> player -> reception counters and zones
  const receptionsByRotation = mapOf<CourtPosition, Map<string, { positive: Counter; sideOut: Counter; zones: Map<string, { count: number; sideOut: Counter }> }>>(() => new Map());
  // rotation -> whole line-up (6 player keys) -> count. The most frequent
  // line-up as a whole, so a player never shows up in two positions.
  const lineupCounts = mapOf<CourtPosition, { receptions: number; lineups: Map<string, { keys: Array<string | null>; count: number }> }>(
    () => ({ receptions: 0, lineups: new Map() }),
  );
  let sets = 0;
  let rallies = 0;

  for (const match of matches) {
    const { side } = match;
    const playerById = new Map<string, ReportPlayer>();
    match.roster.forEach((entry) => {
      const player = toReportPlayer(entry);
      playerById.set(entry.id, player);
      if (!players.has(player.key)) players.set(player.key, player);
      if (entry.isLibero || entry.role === 'libero') liberoKeys.add(player.key);
      if (entry.role === 'middle_blocker') middleBlockerKeys.add(player.key);
      if (entry.role && !playerRoles.has(player.key)) playerRoles.set(player.key, entry.role);
    });
    const playerKey = (id: string | undefined) => (id ? playerById.get(id)?.key ?? null : null);
    const nonSetterIds = new Set(
      match.roster
        .filter((entry) => entry.isLibero || entry.role === 'libero' || entry.role === 'middle_blocker')
        .map((entry) => entry.id),
    );
    const setterPlayerIds: Record<TeamSide, ReadonlySet<string>> = {
      home: new Set(),
      away: new Set(),
    };
    const nonSetterPlayerIds: Record<TeamSide, ReadonlySet<string>> = {
      home: match.side === 'home' ? nonSetterIds : new Set(),
      away: match.side === 'away' ? nonSetterIds : new Set(),
    };
    setterPlayerIds[match.side] = collectSetterPlayerIds(
      match.events,
      match.roster.filter((entry) => entry.role === 'setter').map((entry) => entry.id),
      match.side,
      nonSetterIds,
    );
    const context = buildTouchCourtContext(match.events, setterPlayerIds, nonSetterPlayerIds);
    const contextOf = (touch: BallTouch): TouchCourtContext => context.get(touch.id) ?? {
      rotation: null,
      setterPlayerId: null,
      playerPosition: null,
      lineup: null,
    };

    for (const event of match.events) {
      if (event.type !== 'set_started') continue;
      sets += 1;
      const lineup = side === 'home' ? event.homeLineup : event.awayLineup;
      for (const liberoId of lineup.liberoPlayerIds ?? []) {
        const key = playerKey(liberoId);
        if (key) liberoKeys.add(key);
      }
      for (const slot of lineup.slots) {
        const key = playerKey(slot.playerId);
        if (key) markPlayed(key, match.matchId);
      }
      const setterPosition = lineup.slots.find((slot) => slot.playerId === lineup.setterPlayerId)?.courtPosition;
      if (setterPosition && setterPosition >= 1 && setterPosition <= 6) {
        const keys = [1, 2, 3, 4, 5, 6].map((zone) => {
          const position = ((setterPosition - 1 + zone - 1) % 6) + 1;
          return playerKey(lineup.slots.find((slot) => slot.courtPosition === position)?.playerId);
        });
        if (keys.every(Boolean)) {
          setsWithSetter += 1;
          const id = keys.join('|');
          const entry = lineupStarts.get(id) ?? { keys: keys as string[], count: 0 };
          entry.count += 1;
          lineupStarts.set(id, entry);
        }
      }
      const setterSlot = lineup.slots.find((slot) => slot.playerId === lineup.setterPlayerId);
      const rotation = setterSlot && setterSlot.courtPosition >= 1 && setterSlot.courtPosition <= 6
        ? setterSlot.courtPosition as CourtPosition
        : null;
      const serving = event.servingTeam === side;
      startingRotations.push({ matchId: match.matchId, setNumber: event.setNumber, rotation, serving });
      if (rotation) startingRotationCounts[rotation][serving ? 'serve' : 'receive'] += 1;
    }

    match.rotationStats.forEach((stats) => {
      const totals = rotationTotals.get(stats.rotationNumber);
      totals.soWins += stats.sideOutWins;
      totals.soAttempts += stats.sideOutAttempts;
      totals.bpWins += stats.breakPointWins;
      totals.bpAttempts += stats.breakPointAttempts;
    });

    rallies += match.rallies.length;

    for (const rally of match.rallies) {
      for (const touch of rally.touches) {
        if (touch.teamSide !== side) continue;
        const key = playerKey(touch.playerId);
        if (key) {
          touchCounts.set(key, (touchCounts.get(key) ?? 0) + 1);
          markPlayed(key, match.matchId);
          const skills = playerSkills.get(key);
          if (touch.skill === 'serve' || touch.skill === 'receive' || touch.skill === 'attack' || touch.skill === 'block' || touch.skill === 'dig') {
            updateSkillStats(skills[touch.skill], touch);
          }
        }
        if (touch.skill === 'serve') {
          teamErrors.serve.add(touch.evaluation === '=');
          if (key) errors.get(key).serve.add(touch.evaluation === '=');
        } else if (touch.skill === 'attack') {
          teamErrors.attack.add(touch.evaluation === '=');
          if (key) {
            errors.get(key).attack.add(touch.evaluation === '=');
            attackers.get(key).kill.add(touch.evaluation === '#');
            attackers.get(key).errors.add(touch.evaluation === '=');
            updateSkillStats(attackers.get(key).skillStats, touch);
          }
        }
      }
    }

    const sequences = extractSideOutSequences(match.rallies).filter((sequence) => sequence.teamSide === side);
    for (const sequence of sequences) {
      const { receive, attack, rallyWon } = sequence;
      const evaluation = receive.evaluation;
      const receiverKey = playerKey(receive.playerId);
      const { rotation, playerPosition, lineup } = contextOf(receive);
      if (rotation && lineup) {
        const counts = lineupCounts.get(rotation);
        counts.receptions += 1;
        const keys = lineup.map((playerId) => playerKey(playerId));
        const signature = keys.map((key) => key ?? '').join('\u0000');
        const entry = counts.lineups.get(signature) ?? { keys, count: 0 };
        entry.count += 1;
        counts.lineups.set(signature, entry);
      }

      teamReception.positive.add(isPositive(evaluation));
      teamReception.errors.add(evaluation === '=');
      if (receiverKey) {
        const counters = receivers.get(receiverKey);
        counters.positive.add(isPositive(evaluation));
        counters.perfect.add(evaluation === '#');
        counters.errors.add(evaluation === '=');
      }
      if (rotation) {
        rotationTotals.get(rotation).reception.add(isPositive(evaluation));
        if (receiverKey) {
          const byPlayer = receptionsByRotation.get(rotation);
          const entry = byPlayer.get(receiverKey) ?? { positive: new Counter(), sideOut: new Counter(), zones: new Map<string, { count: number; sideOut: Counter }>() };
          entry.positive.add(isPositive(evaluation));
          if (rallyWon !== null) entry.sideOut.add(rallyWon);
          const rally = match.rallies.find((candidate) => candidate.setNumber === sequence.setNumber && candidate.rallyNumber === sequence.rallyNumber);
          const serve = rally?.touches.find((touch) => touch.skill === 'serve');
          const zone = receptionZone(receive, serve);
          if (zone) {
            const zEntry = entry.zones.get(zone) ?? { count: 0, sideOut: new Counter() };
            zEntry.count += 1;
            if (rallyWon !== null) zEntry.sideOut.add(rallyWon);
            entry.zones.set(zone, zEntry);
          }
          byPlayer.set(receiverKey, entry);
        }
      }

      if (evaluation && (FIRST_BALL_EVALUATIONS as readonly string[]).includes(evaluation)) {
        const counters = firstBall.get(evaluation as FirstBallEvaluation);
        counters.kill.add(attack?.evaluation === '#');
        counters.attackLost.add(attack?.evaluation === '=' || attack?.evaluation === '/');
        counters.sideOut.add(rallyWon === true);
      }

      if (isPositive(evaluation)) {
        positive.all.add(attack, rallyWon);
        if (playerPosition !== null) {
          if (isFrontRow(playerPosition)) {
            positive.receiverFrontRow.add(attack, rallyWon);
            if (attack && attack.playerId && attack.playerId === receive.playerId) {
              positive.frontRowReceiverAttacks.add(attack, rallyWon);
            } else {
              positive.frontRowReceiverOtherAttacks.add(attack, rallyWon);
            }
          } else {
            positive.receiverBackRow.add(attack, rallyWon);
          }
        }
      }
    }
  }

  const player = (key: string): ReportPlayer => players.get(key) ?? { key, jersey: '', name: key };

  const receiverRows: ReceiverMetrics[] = [...receivers.map.entries()].map(([key, counters]) => ({
    player: player(key),
    receptions: counters.positive.total,
    positive: counters.positive.value,
    perfect: counters.perfect.value,
    errors: counters.errors.value,
  })).sort((left, right) => right.receptions - left.receptions);

  const serveTargets: ServeTarget[] = [];
  for (const rotation of ROTATIONS) {
    const byPlayer = receptionsByRotation.map.get(rotation);
    if (!byPlayer || byPlayer.size === 0) continue;
    // The weakest receiver of the whole sample among those receiving in this rotation:
    // her overall rate is steadier than the few receptions of one rotation.
    const candidates = [...byPlayer.entries()]
      .map(([key, entry]) => ({ key, entry, overall: receivers.map.get(key)?.positive.value }))
      .filter((candidate) => candidate.entry.positive.total > 0
        && candidate.overall !== undefined && candidate.overall.rate !== null
        && candidate.overall.total >= minReceptions)
      .sort((left, right) => (left.overall!.rate! - right.overall!.rate!) || (right.entry.positive.total - left.entry.positive.total));
    const contextualTotal = [...byPlayer.values()].reduce((acc, row) => ({ count: acc.count + row.sideOut.value.count, total: acc.total + row.sideOut.total }), { count: 0, total: 0 });
    candidates.sort((a, b) => {
      const score = (candidate: typeof a) => {
        const own = candidate.entry.sideOut.value;
        const other = ratio(contextualTotal.count - own.count, contextualTotal.total - own.total);
        return own.total >= minReceptions && other.total >= minReceptions && own.rate !== null && other.rate !== null
          ? (other.rate - own.rate) * own.total / Math.max(1, contextualTotal.total) : -1;
      };
      return score(b) - score(a);
    });
    const target = candidates.find(candidate => {
      const own = candidate.entry.sideOut.value;
      const other = ratio(contextualTotal.count - own.count, contextualTotal.total - own.total);
      return own.total >= Math.max(1, minReceptions) && other.total >= Math.max(1, minReceptions)
        && own.rate !== null && other.rate !== null && other.rate - own.rate >= .05;
    });
    if (!target) continue;
    const zones = [...target.entry.zones.entries()];
    const zoneTotal = zones.reduce((sum, [, z]) => sum + z.count, 0);
    const qualifiedZones = zones.filter(([, z]) => z.sideOut.total >= minReceptions && z.sideOut.value.rate !== null);
    const chosenZone = (qualifiedZones.length > 0
      ? qualifiedZones.sort((left, right) => (left[1].sideOut.value.rate! - right[1].sideOut.value.rate!) || (right[1].count - left[1].count))
      : zones.sort((left, right) => right[1].count - left[1].count))[0];
    serveTargets.push({
      rotation,
      player: player(target.key),
      positive: target.overall!,
      sideOut: target.entry.sideOut.value,
      comparison: ratio(contextualTotal.count - target.entry.sideOut.value.count, contextualTotal.total - target.entry.sideOut.total),
      inRotation: target.entry.positive.value,
      zone: chosenZone?.[0] ?? null,
      zoneActions: chosenZone?.[1].count ?? 0,
      zoneShare: chosenZone && zoneTotal > 0 ? chosenZone[1].count / zoneTotal : null,
    });
  }

  return {
    sample: { matches: matches.length, sets, rallies },
    touchesByPlayer: Object.fromEntries(touchCounts),
    playerSkills: Object.fromEntries(playerSkills.map),
    startingLineup: (() => {
      const best = [...lineupStarts.values()].sort((a, b) => b.count - a.count || a.keys.join().localeCompare(b.keys.join()))[0];
      if (!best) return undefined;
      // Liberos: the one who receives most and the one who digs most; both when they are different athletes.
      const liberoUse = [...liberoKeys].map((key) => ({ key, receive: playerSkills.get(key).receive.total, dig: playerSkills.get(key).dig.total }))
        .filter((entry) => players.has(entry.key) && entry.receive + entry.dig > 0);
      const topReceiver = [...liberoUse].sort((a, b) => b.receive - a.receive)[0];
      const topDigger = [...liberoUse].sort((a, b) => b.dig - a.dig)[0];
      const mostUsed = [...liberoUse].sort((a, b) => (b.receive + b.dig) - (a.receive + a.dig))[0];
      const liberos: Array<{ player: ReportPlayer; use: 'both' | 'reception' | 'defence' }> = topReceiver && topDigger && topReceiver.key !== topDigger.key && topReceiver.receive > 0 && topDigger.dig > 0
        ? [{ player: players.get(topReceiver.key)!, use: 'reception' }, { player: players.get(topDigger.key)!, use: 'defence' }]
        : mostUsed ? [{ player: players.get(mostUsed.key)!, use: 'both' }] : [];
      return { sets: best.count, totalSets: setsWithSetter, slots: best.keys.map((key) => players.get(key)!), liberos };
    })(),
    matchList: matches
      .map((match, index) => ({ match, index }))
      .sort((a, b) => (a.match.playedAt ?? '').localeCompare(b.match.playedAt ?? '') || a.index - b.index)
      .map(({ match }) => ({ matchId: match.matchId, facedName: match.facedName, playedAt: match.playedAt })),
    recentStartingRotationCounts: (() => {
      const latest = matches
        .map((match, index) => ({ id: match.matchId, playedAt: match.playedAt ?? '', index }))
        .sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.index - b.index)
        .slice(-4)
        .map((match) => match.id);
      const counts = EMPTY_COUNTS();
      for (const row of startingRotations) {
        if (row.rotation && latest.includes(row.matchId)) counts[row.rotation][row.serving ? 'serve' : 'receive'] += 1;
      }
      return { matches: latest.length, counts };
    })(),
    teamPlayers: [...players.values()]
      .filter((player) => playedMatches.has(player.key))
      .sort((a, b) => (Number(a.jersey) || 999) - (Number(b.jersey) || 999) || a.name.localeCompare(b.name))
      .map((player) => ({ player, role: playerRoles.get(player.key), libero: liberoKeys.has(player.key), matches: playedMatches.get(player.key)!.size })),
    teamIndicators: computeTeamIndicators(matches),
    startingRotations,
    startingRotationCounts,
    rotations: ROTATIONS.map((rotation) => {
      const totals = rotationTotals.map.get(rotation);
      return {
        rotation,
        sideOut: ratio(totals?.soWins ?? 0, totals?.soAttempts ?? 0),
        breakPoint: ratio(totals?.bpWins ?? 0, totals?.bpAttempts ?? 0),
        receptionPositive: totals?.reception.value ?? ratio(0, 0),
      };
    }),
    receivers: receiverRows,
    receiverSideOut: [...receptionsByRotation.map.entries()].flatMap(([rotation, rows]) => {
      const total = [...rows.values()].reduce((acc, row) => ({ count: acc.count + row.sideOut.value.count, total: acc.total + row.sideOut.total }), { count: 0, total: 0 });
      return [...rows.entries()].map(([key, row]) => ({ player: player(key), rotation, sideOut: row.sideOut.value,
        others: ratio(total.count - row.sideOut.value.count, total.total - row.sideOut.total) }));
    }),
    receptionTeam: { positive: teamReception.positive.value, errors: teamReception.errors.value },
    firstBall: FIRST_BALL_EVALUATIONS.map((evaluation) => {
      const counters = firstBall.map.get(evaluation);
      return {
        evaluation,
        receptions: counters?.sideOut.total ?? 0,
        kill: counters?.kill.value ?? ratio(0, 0),
        attackLost: counters?.attackLost.value ?? ratio(0, 0),
        sideOut: counters?.sideOut.value ?? ratio(0, 0),
      };
    }),
    positiveReception: {
      all: positive.all.value,
      receiverFrontRow: positive.receiverFrontRow.value,
      receiverBackRow: positive.receiverBackRow.value,
      frontRowReceiverAttacks: positive.frontRowReceiverAttacks.value,
      frontRowReceiverOtherAttacks: positive.frontRowReceiverOtherAttacks.value,
    },
    attackers: [...attackers.map.entries()].map(([key, counters]) => ({
      player: player(key),
      attacks: counters.kill.total,
      kill: counters.kill.value,
      errors: counters.errors.value,
      efficiency: getActiveIndicators().attackEfficiency(counters.skillStats),
    })).sort((left, right) => right.attacks - left.attacks),
    errors: [...errors.map.entries()].map(([key, counters]) => ({
      player: player(key),
      serve: counters.serve.value,
      attack: counters.attack.value,
    })).sort((left, right) => (right.serve.count + right.attack.count) - (left.serve.count + left.attack.count)),
    teamErrors: { serve: teamErrors.serve.value, attack: teamErrors.attack.value },
    serveTargets,
    receptionLineups: ROTATIONS.flatMap((rotation) => {
      const counts = lineupCounts.map.get(rotation);
      if (!counts || counts.receptions === 0) return [];
      return [{
        rotation,
        receptions: counts.receptions,
        slots: (() => {
          const best = [...counts.lineups.values()].sort((left, right) => right.count - left.count)[0];
          const resolvedKeys = applyLiberoToReceptionLineup(
            rotation,
            best.keys,
            liberoKeys,
            middleBlockerKeys,
            playerRoles,
            receptionsByRotation.map.get(rotation),
            receivers.map,
          );
          return resolvedKeys.map((key, index) => ({
            position: (index + 1) as CourtPosition,
            player: key ? player(key) : null,
            share: best.count / counts.receptions,
          }));
        })(),
      }];
    }),
  };
}

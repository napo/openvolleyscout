/**
 * Metrics of an opponent report, over the selected matches of ONE team.
 * Everything is counted from the opponent's point of view. Pure module.
 */
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchVideoAnalysis } from '@src/domain/video/types';
import type { RallyStats, RotationStats } from '@src/features/scouting/model/match-stats';
import { extractSideOutSequences } from '../../analytics/sideout/sideout-distribution';
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

export interface OpponentReportMetrics {
  sample: { matches: number; sets: number; rallies: number };
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

/** DataVolley zone (1-9) where a reception happened: the reception's end zone, else the serve's. */
export function receptionZone(receive: BallTouch, serve: BallTouch | undefined): string | null {
  const pick = (touch: BallTouch | undefined) => {
    const code = touch?.endZoneCode ?? touch?.advancedDetails?.serve?.targetZone;
    const digit = typeof code === 'string' ? code.trim().charAt(0) : '';
    return /^[1-9]$/.test(digit) ? digit : null;
  };
  return pick(receive) ?? pick(serve);
}

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

export function computeOpponentReportMetrics(
  matches: readonly ReportMatchInput[],
  { minReceptions = 0 }: MetricsOptions = {},
): OpponentReportMetrics {
  const players = new Map<string, ReportPlayer>();
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
  const attackers = mapOf<string, { kill: Counter; errors: Counter }>(() => ({ kill: new Counter(), errors: new Counter() }));
  const errors = mapOf<string, { serve: Counter; attack: Counter }>(() => ({ serve: new Counter(), attack: new Counter() }));
  const teamErrors = { serve: new Counter(), attack: new Counter() };
  // rotation -> player -> reception counters and zones
  const receptionsByRotation = mapOf<CourtPosition, Map<string, { positive: Counter; sideOut: Counter; zones: Map<string, number> }>>(() => new Map());
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
        if (touch.skill === 'serve') {
          teamErrors.serve.add(touch.evaluation === '=');
          if (key) errors.get(key).serve.add(touch.evaluation === '=');
        } else if (touch.skill === 'attack') {
          teamErrors.attack.add(touch.evaluation === '=');
          if (key) {
            errors.get(key).attack.add(touch.evaluation === '=');
            attackers.get(key).kill.add(touch.evaluation === '#');
            attackers.get(key).errors.add(touch.evaluation === '=');
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
          const entry = byPlayer.get(receiverKey) ?? { positive: new Counter(), sideOut: new Counter(), zones: new Map<string, number>() };
          entry.positive.add(isPositive(evaluation));
          if (rallyWon !== null) entry.sideOut.add(rallyWon);
          const rally = match.rallies.find((candidate) => candidate.setNumber === sequence.setNumber && candidate.rallyNumber === sequence.rallyNumber);
          const serve = rally?.touches.find((touch) => touch.skill === 'serve');
          const zone = receptionZone(receive, serve);
          if (zone) entry.zones.set(zone, (entry.zones.get(zone) ?? 0) + 1);
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
    const zones = [...target.entry.zones.entries()].sort((left, right) => right[1] - left[1]);
    const zoneTotal = zones.reduce((sum, [, count]) => sum + count, 0);
    serveTargets.push({
      rotation,
      player: player(target.key),
      positive: target.overall!,
      sideOut: target.entry.sideOut.value,
      comparison: ratio(contextualTotal.count - target.entry.sideOut.value.count, contextualTotal.total - target.entry.sideOut.total),
      inRotation: target.entry.positive.value,
      zone: zones[0]?.[0] ?? null,
      zoneActions: zones[0]?.[1] ?? 0,
      zoneShare: zones[0] && zoneTotal > 0 ? zones[0][1] / zoneTotal : null,
    });
  }

  return {
    sample: { matches: matches.length, sets, rallies },
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
          return best.keys.map((key, index) => ({
            position: (index + 1) as CourtPosition,
            player: key ? player(key) : null,
            share: best.count / counts.receptions,
          }));
        })(),
      }];
    }),
  };
}

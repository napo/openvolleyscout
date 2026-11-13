import type { BallTouch } from '@src/domain/touch/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { attackZoneNumber, extractSideOutSequences } from '@src/features/analytics/sideout/sideout-distribution';
import { classifyAttackPrecedingContext } from '@src/features/analytics/rally-phase/rally-phase-classifier';
import { extractHeatmapEvents, type HeatmapEvent } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { buildTouchCourtContext, collectSetterPlayerIds } from './court-context';
import type { ReportMatchInput, ReportPlayer, Ratio } from './report-metrics';
import { ratio, toReportPlayer } from './report-metrics';
import { compareReportPlayers } from './report-keys';

export interface AttackDistribution {
  value: string;
  count: number;
  matches: number;
}

export interface BlockPerformance {
  blockers: number;
  attacks: number;
  matches: number;
  kill: Ratio;
  errors: Ratio;
  efficiency: number | null;
}

export interface AttackPerformance {
  attacks: number;
  matches: number;
  kill: Ratio;
  errors: Ratio;
  efficiency: number | null;
  zones: AttackDistribution[];
  directions: AttackDistribution[];
  types: AttackDistribution[];
  blockers: BlockPerformance[];
}

export interface AttackerReportMetrics {
  player: ReportPlayer;
  all: AttackPerformance;
  afterReceive: AttackPerformance;
  afterDig: AttackPerformance;
  afterNegativeReception: AttackPerformance;
  highBall: AttackPerformance;
  lateSet: AttackPerformance;
  /** Attacks in difficult situations (negative reception, high ball, or late set >= 20), counted once each. */
  clutch: AttackPerformance;
  evaluationBang: AttackPerformance;
  evaluationMinus: AttackPerformance;
  /** Draw-ready attack trajectories from the existing heatmap extractor. */
  directionsForDrawing: HeatmapEvent[];
  directionsForDrawingMatches: number;
}

export interface SetterAttackPlayerMetrics {
  player: ReportPlayer;
  attempts: number;
  kills: number;
  matches: number;
}

export interface SetterAttackZoneMetrics {
  zone: number;
  attempts: number;
  kills: number;
  matches: number;
  players: SetterAttackPlayerMetrics[];
}

export interface SetterReceptionBandMetrics {
  attempts: number;
  matches: number;
  /** Most frequent attack zone in this rotation and reception band; null when none. */
  topZone?: number | null;
  /** Share of the most frequent attack zone (`topZone.attempts / attempts`). */
  predictability?: Ratio;
  zones: SetterAttackZoneMetrics[];
}

export interface SetterRotationMetrics {
  rotation: number;
  preferredPositiveZone: number | null;
  positive: SetterReceptionBandMetrics;
  negative: SetterReceptionBandMetrics;
}

export interface SetterReportMetrics {
  player: ReportPlayer;
  rotations: SetterRotationMetrics[];
}

export interface AttackingReportMetrics {
  attackers: AttackerReportMetrics[];
  setters: SetterReportMetrics[];
}

interface MutableDistribution {
  count: number;
  matches: Set<string>;
}

interface MutablePerformance {
  attacks: number;
  kills: number;
  errors: number;
  matches: Set<string>;
  zones: Map<string, MutableDistribution>;
  directions: Map<string, MutableDistribution>;
  types: Map<string, MutableDistribution>;
  blockers: Map<string, { attacks: number; kills: number; errors: number; matches: Set<string> }>;
}

interface MutableAttacker {
  player: ReportPlayer;
  all: MutablePerformance;
  afterReceive: MutablePerformance;
  afterDig: MutablePerformance;
  afterNegativeReception: MutablePerformance;
  highBall: MutablePerformance;
  lateSet: MutablePerformance;
  clutch: MutablePerformance;
  evaluationBang: MutablePerformance;
  evaluationMinus: MutablePerformance;
  directionsForDrawing: HeatmapEvent[];
  directionsForDrawingMatches: Set<string>;
}

interface MutableSetterPlayer {
  player: ReportPlayer;
  attempts: number;
  kills: number;
  matches: Set<string>;
}

interface MutableSetterZone {
  attempts: number;
  kills: number;
  matches: Set<string>;
  players: Map<string, MutableSetterPlayer>;
}

interface MutableSetterBand {
  attempts: number;
  matches: Set<string>;
  zones: Map<number, MutableSetterZone>;
}

interface MutableSetterRotation {
  positive: MutableSetterBand;
  negative: MutableSetterBand;
}

interface MutableSetter {
  player: ReportPlayer;
  rotations: Map<number, MutableSetterRotation>;
}

const createPerformance = (): MutablePerformance => ({
  attacks: 0,
  kills: 0,
  errors: 0,
  matches: new Set(),
  zones: new Map(),
  directions: new Map(),
  types: new Map(),
  blockers: new Map(),
});

function distribution(map: Map<string, MutableDistribution>): AttackDistribution[] {
  return [...map.entries()]
    .map(([value, item]) => ({ value, count: item.count, matches: item.matches.size }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function addDistribution(map: Map<string, MutableDistribution>, value: string | null, matchId: string): void {
  if (!value) return;
  const item = map.get(value) ?? { count: 0, matches: new Set<string>() };
  item.count += 1;
  item.matches.add(matchId);
  map.set(value, item);
}

function isBlockOutAfterAttack(sorted: readonly BallTouch[], attackIndex: number, teamSide: TeamSide): boolean {
  const attack = sorted[attackIndex];
  if (attack.evaluation !== '#') return false;
  for (let index = attackIndex + 1; index < sorted.length; index += 1) {
    const touch = sorted[index];
    if (touch.teamSide === teamSide) continue;
    return touch.skill === 'block' && touch.evaluation === '=';
  }
  return false;
}

function attackType(touch: BallTouch, isBlockOut = false): string | null {
  const explicitType = touch.advancedDetails?.attack?.type;
  if (explicitType === 'block_out' || isBlockOut) return 'block_out';
  if (explicitType) return explicitType;
  const rawCode = (touch.attackType ?? touch.skillTypeCode)?.toUpperCase();
  if (rawCode === 'P') return 'tip';
  return touch.advancedDetails?.attack?.tempo
    ?? touch.attackType
    ?? touch.skillTypeCode
    ?? null;
}

function addAttack(
  performance: MutablePerformance,
  matchId: string,
  touch: BallTouch,
  blockerCount?: number,
  isBlockOut = false,
): void {
  performance.attacks += 1;
  performance.matches.add(matchId);
  if (touch.evaluation === '#') performance.kills += 1;
  if (touch.evaluation === '=' || touch.evaluation === '/') performance.errors += 1;

  const zone = attackZoneNumber(touch);
  if (zone !== null) addDistribution(performance.zones, String(zone), matchId);
  addDistribution(
    performance.directions,
    touch.advancedDetails?.attack?.direction ?? (touch.direction?.end?.zoneId ? String(touch.direction.end.zoneId) : null),
    matchId,
  );
  addDistribution(performance.types, attackType(touch, isBlockOut), matchId);

  if (blockerCount !== undefined && blockerCount >= 1 && blockerCount <= 3) {
    const blocker = performance.blockers.get(String(blockerCount)) ?? {
      attacks: 0,
      kills: 0,
      errors: 0,
      matches: new Set<string>(),
    };
    blocker.attacks += 1;
    blocker.matches.add(matchId);
    if (touch.evaluation === '#') blocker.kills += 1;
    if (touch.evaluation === '=' || touch.evaluation === '/') blocker.errors += 1;
    performance.blockers.set(String(blockerCount), blocker);
  }
}

function getPreviousTouch(
  sorted: readonly BallTouch[],
  attackIndex: number,
  teamSide: TeamSide,
  skill: BallTouch['skill'],
): BallTouch | null {
  for (let index = attackIndex - 1; index >= 0; index -= 1) {
    const touch = sorted[index];
    if (touch.teamSide !== teamSide) return null;
    if (touch.skill === 'set' || touch.skill === 'cover') continue;
    return touch.skill === skill ? touch : null;
  }
  return null;
}

function previousSet(sorted: readonly BallTouch[], attackIndex: number, teamSide: TeamSide): BallTouch | null {
  for (let index = attackIndex - 1; index >= 0; index -= 1) {
    const touch = sorted[index];
    if (touch.teamSide !== teamSide) return null;
    if (touch.skill === 'set') return touch;
    if (touch.skill !== 'cover') return null;
  }
  return null;
}

function blockersAfterAttack(sorted: readonly BallTouch[], attackIndex: number, teamSide: TeamSide): number | undefined {
  for (let index = attackIndex + 1; index < sorted.length; index += 1) {
    const touch = sorted[index];
    if (touch.teamSide === teamSide) continue;
    return touch.skill === 'block' ? touch.numBlockers : undefined;
  }
  return undefined;
}

function isHighBall(set: BallTouch | null, attack: BallTouch): boolean {
  return set?.advancedDetails?.set?.tempo === 'high_ball'
    || set?.advancedDetails?.set?.type === 'high_ball'
    || set?.setType === 'high_ball'
    || attack.advancedDetails?.attack?.tempo === 'high_ball';
}

function scoreBeforeRallies(rallies: readonly RallyStats[]): Map<string, boolean> {
  const scores = new Map<number, { home: number; away: number }>();
  const late = new Map<string, boolean>();
  for (const rally of [...rallies].sort((left, right) => left.setNumber - right.setNumber || left.rallyNumber - right.rallyNumber)) {
    const score = scores.get(rally.setNumber) ?? { home: 0, away: 0 };
    late.set(`${rally.setNumber}:${rally.rallyNumber}`, score.home >= 20 || score.away >= 20);
    if (rally.pointWinner) score[rally.pointWinner] += 1;
    scores.set(rally.setNumber, score);
  }
  return late;
}

function finishPerformance(value: MutablePerformance): AttackPerformance {
  return {
    attacks: value.attacks,
    matches: value.matches.size,
    kill: ratio(value.kills, value.attacks),
    errors: ratio(value.errors, value.attacks),
    efficiency: value.attacks > 0 ? (value.kills - value.errors) / value.attacks : null,
    zones: distribution(value.zones),
    directions: distribution(value.directions),
    types: distribution(value.types),
    blockers: [...value.blockers.entries()]
      .map(([blockers, item]) => ({
        blockers: Number(blockers),
        attacks: item.attacks,
        matches: item.matches.size,
        kill: ratio(item.kills, item.attacks),
        errors: ratio(item.errors, item.attacks),
        efficiency: (item.kills - item.errors) / item.attacks,
      }))
      .sort((left, right) => left.blockers - right.blockers),
  };
}

const BACK_ROW_ZONE_MAP: Record<number, number> = { 7: 5, 8: 6, 9: 1 };

function addSetterChoice(
  setter: MutableSetter,
  rotation: number,
  matchId: string,
  receptionEvaluation: BallTouch['evaluation'],
  attack: BallTouch,
  attacker: ReportPlayer | undefined,
): void {
  const row = setter.rotations.get(rotation) ?? {
    positive: { attempts: 0, matches: new Set<string>(), zones: new Map<number, MutableSetterZone>() },
    negative: { attempts: 0, matches: new Set<string>(), zones: new Map<number, MutableSetterZone>() },
  };
  const band = receptionEvaluation === '#' || receptionEvaluation === '+' ? row.positive
    : receptionEvaluation === '!' || receptionEvaluation === '-' ? row.negative
      : null;
  if (!band) return;

  band.attempts += 1;
  band.matches.add(matchId);
  const rawZone = attackZoneNumber(attack);
  const zone = rawZone === null ? null : (BACK_ROW_ZONE_MAP[rawZone] ?? rawZone);
  if (zone === null || zone > 6) {
    setter.rotations.set(rotation, row);
    return;
  }

  const zoneMetrics = band.zones.get(zone) ?? {
    attempts: 0,
    kills: 0,
    matches: new Set<string>(),
    players: new Map<string, MutableSetterPlayer>(),
  };
  zoneMetrics.attempts += 1;
  zoneMetrics.matches.add(matchId);
  if (attack.evaluation === '#') zoneMetrics.kills += 1;
  if (attacker) {
    const playerMetrics = zoneMetrics.players.get(attacker.key) ?? {
      player: attacker,
      attempts: 0,
      kills: 0,
      matches: new Set<string>(),
    };
    playerMetrics.attempts += 1;
    playerMetrics.matches.add(matchId);
    if (attack.evaluation === '#') playerMetrics.kills += 1;
    zoneMetrics.players.set(attacker.key, playerMetrics);
  }
  band.zones.set(zone, zoneMetrics);
  setter.rotations.set(rotation, row);
}

export function computeAttackingReportMetrics(matches: readonly ReportMatchInput[]): AttackingReportMetrics {
  const attackers = new Map<string, MutableAttacker>();
  const setters = new Map<string, MutableSetter>();

  for (const match of matches) {
    const playerById = new Map<string, ReportPlayer>();
    const rosterSetterIds = new Set<string>();
    const nonSetterIds = new Set<string>();
    for (const entry of match.roster) {
      const player = toReportPlayer(entry);
      playerById.set(entry.id, player);
      if (entry.role === 'setter') rosterSetterIds.add(entry.id);
      if (entry.isLibero || entry.role === 'libero' || entry.role === 'middle_blocker') {
        nonSetterIds.add(entry.id);
      }
    }

    // A setter declared in the file ("*P"/"aP", stored as setter_assigned) is a setter even if the
    // roster lists another role. A merely recorded touch setter is not trusted for this.
    for (const event of match.events) {
      if (event.type === 'setter_assigned' && event.teamSide === match.side) nonSetterIds.delete(event.setterPlayerId);
      if (event.type === 'set_started') {
        const lineup = event.homeLineup.teamSide === match.side ? event.homeLineup : event.awayLineup;
        if (lineup.setterPlayerId) nonSetterIds.delete(lineup.setterPlayerId);
      }
    }
    const lateRallies = scoreBeforeRallies(match.rallies);
    const setterIds = collectSetterPlayerIds(match.events, rosterSetterIds, match.side, nonSetterIds);
    const setterPlayerIds: Record<TeamSide, ReadonlySet<string>> = {
      home: match.side === 'home' ? setterIds : new Set(),
      away: match.side === 'away' ? setterIds : new Set(),
    };
    const nonSetterPlayerIds: Record<TeamSide, ReadonlySet<string>> = {
      home: match.side === 'home' ? nonSetterIds : new Set(),
      away: match.side === 'away' ? nonSetterIds : new Set(),
    };
    const touchContext = buildTouchCourtContext(match.events, setterPlayerIds, nonSetterPlayerIds);
    for (const rally of match.rallies) {
      const sorted = [...rally.touches].sort((left, right) => left.sequenceNumber - right.sequenceNumber || left.createdAt - right.createdAt);
      const contexts = classifyAttackPrecedingContext(rally);
      const drawings = extractHeatmapEvents(sorted).filter((event) => event.skill === 'attack' && event.teamSide === match.side);
      const drawingByTouch = new Map(drawings.map((event) => [event.touchId, event]));
      for (let index = 0; index < sorted.length; index += 1) {
        const touch = sorted[index];
        if (touch.teamSide !== match.side || touch.skill !== 'attack') continue;
        const player = playerById.get(touch.playerId ?? '');
        if (!player) continue;

        const attacker = attackers.get(player.key) ?? {
          player,
          all: createPerformance(),
          afterReceive: createPerformance(),
          afterDig: createPerformance(),
          afterNegativeReception: createPerformance(),
          highBall: createPerformance(),
          lateSet: createPerformance(),
          clutch: createPerformance(),
          evaluationBang: createPerformance(),
          evaluationMinus: createPerformance(),
          directionsForDrawing: [],
          directionsForDrawingMatches: new Set(),
        };
        const context = contexts.get(touch.id);
        const receive = context === 'receive' ? getPreviousTouch(sorted, index, match.side, 'receive') : null;
        const set = previousSet(sorted, index, match.side);
        const blockerCount = touch.numBlockers ?? blockersAfterAttack(sorted, index, match.side);
        const isBlockOut = isBlockOutAfterAttack(sorted, index, match.side);
        const isSetterAttack = touch.playerId ? rosterSetterIds.has(touch.playerId) : false;
        const isNegativeReception = Boolean(receive && (receive.evaluation === '!' || receive.evaluation === '-'));
        const high = isHighBall(set, touch);
        const late = Boolean(lateRallies.get(`${rally.setNumber}:${rally.rallyNumber}`));
        addAttack(attacker.all, match.matchId, touch, blockerCount, isBlockOut);
        // A setter attack is tracked separately as a setter distribution, not as a
        // first-ball attacker in the "after reception" player split.
        if (context === 'receive' && !isSetterAttack) {
          addAttack(attacker.afterReceive, match.matchId, touch, blockerCount, isBlockOut);
        }
        if (context === 'dig') addAttack(attacker.afterDig, match.matchId, touch, blockerCount, isBlockOut);
        if (isNegativeReception) {
          addAttack(attacker.afterNegativeReception, match.matchId, touch, blockerCount, isBlockOut);
        }
        if (high) addAttack(attacker.highBall, match.matchId, touch, blockerCount, isBlockOut);
        if (late) addAttack(attacker.lateSet, match.matchId, touch, blockerCount, isBlockOut);
        if (isNegativeReception || high || late) {
          addAttack(attacker.clutch, match.matchId, touch, blockerCount, isBlockOut);
        }
        if (touch.evaluation === '!') addAttack(attacker.evaluationBang, match.matchId, touch, blockerCount, isBlockOut);
        if (touch.evaluation === '-') addAttack(attacker.evaluationMinus, match.matchId, touch, blockerCount, isBlockOut);
        const drawing = drawingByTouch.get(touch.id);
        if (drawing) {
          attacker.directionsForDrawing.push(drawing);
          attacker.directionsForDrawingMatches.add(match.matchId);
        }
        attackers.set(player.key, attacker);
      }
    }

    for (const sequence of extractSideOutSequences(match.rallies, setterPlayerIds)) {
      if (sequence.teamSide !== match.side || !sequence.attack) continue;
      const receiveContext = touchContext.get(sequence.receive.id);
      const rotation = sequence.setterPosition ?? receiveContext?.rotation ?? null;
      if (rotation === null || rotation < 1 || rotation > 6) continue;
      const canBeSetter = (playerId: string | null | undefined): playerId is string => Boolean(
        playerId && playerById.has(playerId) && !nonSetterIds.has(playerId),
      );
      const recordedSetterPlayerId = match.side === 'home'
        ? sequence.receive.homeSetterPlayerId
        : sequence.receive.awaySetterPlayerId;
      const slotSetterPlayerId = receiveContext?.lineup?.[rotation - 1];
      const onCourtSetterPlayerId = receiveContext?.lineup?.find(
        (playerId) => canBeSetter(playerId) && setterIds.has(playerId),
      );
      const setterPlayerId = (canBeSetter(recordedSetterPlayerId) ? recordedSetterPlayerId : null)
        ?? (canBeSetter(slotSetterPlayerId) ? slotSetterPlayerId : null)
        ?? (canBeSetter(receiveContext?.setterPlayerId) ? receiveContext?.setterPlayerId : null)
        ?? (sequence.set?.evaluation !== '!' && canBeSetter(sequence.set?.playerId) ? sequence.set.playerId : null)
        ?? onCourtSetterPlayerId
        ?? null;
      if (!setterPlayerId) continue;
      if (!['#', '+', '!', '-'].includes(sequence.receive.evaluation ?? '')) continue;
      const setterPlayer = playerById.get(setterPlayerId);
      if (!setterPlayer) continue;
      const setter = setters.get(setterPlayer.key) ?? {
        player: setterPlayer,
        rotations: new Map<number, MutableSetterRotation>(),
      };
      addSetterChoice(
        setter,
        rotation,
        match.matchId,
        sequence.receive.evaluation,
        sequence.attack,
        playerById.get(sequence.attack.playerId ?? ''),
      );
      setters.set(setterPlayer.key, setter);
    }
  }

  const sortedSetters = [...setters.values()]
    .map((setter) => ({
      player: setter.player,
      courtExposure: [...setter.rotations.values()].reduce(
        (sum, row) => sum + row.positive.attempts + row.negative.attempts,
        0,
      ),
      rotations: [...setter.rotations.entries()]
        .map(([rotation, row]) => {
          const finishBand = (band: MutableSetterBand): SetterReceptionBandMetrics => {
            const zones = [...band.zones.entries()]
              .map(([zone, zoneMetrics]) => ({
                zone,
                attempts: zoneMetrics.attempts,
                kills: zoneMetrics.kills,
                matches: zoneMetrics.matches.size,
                players: [...zoneMetrics.players.values()]
                  .map((player) => ({
                    player: player.player,
                    attempts: player.attempts,
                    kills: player.kills,
                    matches: player.matches.size,
                  }))
                  .sort((left, right) => compareReportPlayers(left.player, right.player)),
              }))
              .sort((left, right) => left.zone - right.zone);
            const top = [...zones].sort((left, right) => right.attempts - left.attempts || left.zone - right.zone)[0];
            return {
              attempts: band.attempts,
              matches: band.matches.size,
              topZone: top?.zone ?? null,
              predictability: ratio(top?.attempts ?? 0, band.attempts),
              zones,
            };
          };
          const positive = finishBand(row.positive);
          const preferredPositiveZone = positive.topZone ?? null;
          return {
            rotation,
            preferredPositiveZone,
            positive,
            negative: finishBand(row.negative),
          };
        })
        .sort((left, right) => left.rotation - right.rotation),
    }))
    .sort((left, right) => {
      if (right.courtExposure !== left.courtExposure) return right.courtExposure - left.courtExposure;
      return compareReportPlayers(left.player, right.player);
    });

  return {
    attackers: [...attackers.values()]
      .map((attacker) => ({
        player: attacker.player,
        all: finishPerformance(attacker.all),
        afterReceive: finishPerformance(attacker.afterReceive),
        afterDig: finishPerformance(attacker.afterDig),
        afterNegativeReception: finishPerformance(attacker.afterNegativeReception),
        highBall: finishPerformance(attacker.highBall),
        lateSet: finishPerformance(attacker.lateSet),
        clutch: finishPerformance(attacker.clutch),
        evaluationBang: finishPerformance(attacker.evaluationBang),
        evaluationMinus: finishPerformance(attacker.evaluationMinus),
        directionsForDrawing: attacker.directionsForDrawing,
        directionsForDrawingMatches: attacker.directionsForDrawingMatches.size,
      }))
      .sort((left, right) => right.all.attacks - left.all.attacks),
    setters: sortedSetters,
  };
}

/**
 * Opponent serving metrics per player and reaction after conceding a break
 * point. Pure module.
 */
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { extractSideOutSequences } from '@src/features/analytics/sideout/sideout-distribution';
import {
  ratio,
  receptionZone,
  toReportPlayer,
  type Ratio,
  type ReportMatchInput,
  type ReportPlayer,
} from './report-metrics';
import { compareReportPlayers } from './report-keys';

export interface ServeDistributionItem {
  value: string;
  count: number;
  matches: number;
  share: number;
}

export interface ServeRouteMetrics {
  startZone: string;
  targetZone: string;
  count: number;
  matches: number;
  share: number;
  aces: number;
  errors: number;
}

/** One serve type of a server (or every serve when the type is unknown). */
export interface ServeTypeBreakdown {
  /** Normalised type (`float`, `jump_float`, `jump_spin`, …) or `''` when not scouted. */
  type: string;
  serves: number;
  matches: number;
  aces: Ratio;
  /** Difficult serves for the receiver (`+` and `/`), aces excluded. */
  hard: Ratio;
  errors: Ratio;
  routes: ServeRouteMetrics[];
}

export interface ServerReportMetrics {
  player: ReportPlayer;
  serves: number;
  matches: number;
  turns: number;
  /** Mean consecutive serves per service turn (`serves / turns`). */
  averageConsecutiveServes: number | null;
  maxConsecutiveServes: number;
  aces: Ratio;
  positive: Ratio;
  errors: Ratio;
  startZones: ServeDistributionItem[];
  targetZones: ServeDistributionItem[];
  types: ServeDistributionItem[];
  routes: ServeRouteMetrics[];
  /** Per serve type, most used first. */
  typeBreakdown: ServeTypeBreakdown[];
}

export interface BreakReactionAttackerMetrics {
  player: ReportPlayer;
  attempts: number;
  matches: number;
  share: Ratio;
  kill: Ratio;
  errors: Ratio;
}

export interface BreakReactionMetrics {
  /** First-ball attacks in the rally immediately following a conceded break point. */
  afterBreakAttacks: {
    attempts: number;
    matches: number;
    attackers: BreakReactionAttackerMetrics[];
  };
  /** First serve by the opponent right after siding out from a rotation where a break was conceded. */
  serveAfterBreak: {
    serves: number;
    matches: number;
    aces: Ratio;
    errors: Ratio;
    types: ServeDistributionItem[];
    targetZones: ServeDistributionItem[];
  };
}

export interface ServingReportMetrics {
  servers: ServerReportMetrics[];
  breakReaction: BreakReactionMetrics;
}

interface MutableCount {
  count: number;
  matches: Set<string>;
}

interface MutableRoute {
  startZone: string;
  targetZone: string;
  count: number;
  matches: Set<string>;
  aces: number;
  errors: number;
}

interface MutableServer {
  player: ReportPlayer;
  serves: number;
  matches: Set<string>;
  turns: number;
  maxConsecutiveServes: number;
  aces: number;
  positive: number;
  errors: number;
  startZones: Map<string, MutableCount>;
  targetZones: Map<string, MutableCount>;
  types: Map<string, MutableCount>;
  routes: Map<string, MutableRoute>;
  byType: Map<string, MutableTypeBreakdown>;
}

interface MutableTypeBreakdown {
  serves: number;
  matches: Set<string>;
  aces: number;
  hard: number;
  errors: number;
  routes: Map<string, MutableRoute>;
}

function addRoute(routes: Map<string, MutableRoute>, startZone: string, targetZone: string, matchId: string, evaluation: string | undefined): void {
  const routeKey = `${startZone}->${targetZone}`;
  const route = routes.get(routeKey) ?? { startZone, targetZone, count: 0, matches: new Set<string>(), aces: 0, errors: 0 };
  route.count += 1;
  route.matches.add(matchId);
  if (evaluation === '#') route.aces += 1;
  if (evaluation === '=') route.errors += 1;
  routes.set(routeKey, route);
}

function finishRoutes(routes: Map<string, MutableRoute>): ServeRouteMetrics[] {
  const total = [...routes.values()].reduce((sum, route) => sum + route.count, 0);
  return [...routes.values()]
    .map((route) => ({
      startZone: route.startZone,
      targetZone: route.targetZone,
      count: route.count,
      matches: route.matches.size,
      share: total > 0 ? route.count / total : 0,
      aces: route.aces,
      errors: route.errors,
    }))
    .sort((left, right) => right.count - left.count || `${left.startZone}${left.targetZone}`.localeCompare(`${right.startZone}${right.targetZone}`));
}

interface MutableBreakAttacker {
  player: ReportPlayer;
  attempts: number;
  kills: number;
  errors: number;
  matches: Set<string>;
}

export function serveStartZone(serve: BallTouch): string | null {
  const raw = serve.startZoneCode
    ?? serve.advancedDetails?.serve?.startZone
    ?? (serve.originZone?.zoneId !== undefined ? String(serve.originZone.zoneId) : undefined)
    ?? (serve.zone?.zoneId !== undefined ? String(serve.zone.zoneId) : undefined);
  const digit = typeof raw === 'string' ? raw.trim().charAt(0) : '';
  return /^[1-9]$/.test(digit) ? digit : null;
}

export function serveTargetZone(serve: BallTouch, receive?: BallTouch): string | null {
  if (receive) {
    const fromReceive = receptionZone(receive, serve);
    if (fromReceive) return fromReceive;
  }
  const raw = serve.endZoneCode
    ?? serve.advancedDetails?.serve?.targetZone
    ?? (serve.targetZone?.zoneId !== undefined ? String(serve.targetZone.zoneId) : undefined)
    ?? (serve.direction?.end?.zoneId !== undefined ? String(serve.direction.end.zoneId) : undefined);
  const digit = typeof raw === 'string' ? raw.trim().charAt(0) : '';
  return /^[1-9]$/.test(digit) ? digit : null;
}

export function serveTypeValue(serve: BallTouch, receive?: BallTouch): string | null {
  const explicit = serve.advancedDetails?.serve?.type;
  if (explicit) {
    return explicit === 'standing_float' ? 'float' : explicit;
  }
  const code = (serve.serveType ?? serve.skillTypeCode ?? receive?.skillTypeCode)?.trim().toUpperCase();
  if (!code) return null;
  if (code === 'Q' || code === 'T') return 'jump_spin';
  if (code === 'M') return 'jump_float';
  if (code === 'H' || code === 'O') return 'float';
  return code.toLowerCase();
}

function addCount(map: Map<string, MutableCount>, value: string | null, matchId: string): void {
  if (!value) return;
  const current = map.get(value) ?? { count: 0, matches: new Set<string>() };
  current.count += 1;
  current.matches.add(matchId);
  map.set(value, current);
}

function finishDistribution(map: Map<string, MutableCount>, total: number): ServeDistributionItem[] {
  const denominator = total > 0 ? total : [...map.values()].reduce((sum, entry) => sum + entry.count, 0);
  return [...map.entries()]
    .map(([value, entry]) => ({
      value,
      count: entry.count,
      matches: entry.matches.size,
      share: denominator > 0 ? entry.count / denominator : 0,
    }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, undefined, { numeric: true }));
}

function sortedTouches(rally: RallyStats): BallTouch[] {
  return [...rally.touches].sort(
    (left, right) => left.sequenceNumber - right.sequenceNumber || left.createdAt - right.createdAt,
  );
}

export function computeServingReportMetrics(matches: readonly ReportMatchInput[]): ServingReportMetrics {
  const servers = new Map<string, MutableServer>();
  const breakAttackers = new Map<string, MutableBreakAttacker>();
  let afterBreakAttempts = 0;
  const afterBreakMatches = new Set<string>();

  let serveAfterBreakCount = 0;
  let serveAfterBreakAces = 0;
  let serveAfterBreakErrors = 0;
  const serveAfterBreakMatches = new Set<string>();
  const serveAfterBreakTypes = new Map<string, MutableCount>();
  const serveAfterBreakZones = new Map<string, MutableCount>();

  for (const match of matches) {
    const { side, matchId } = match;
    const otherSide: TeamSide = side === 'home' ? 'away' : 'home';
    const playerById = new Map<string, ReportPlayer>();
    for (const entry of match.roster) {
      playerById.set(entry.id, toReportPlayer(entry));
    }

    const getOrCreateServer = (player: ReportPlayer): MutableServer => {
      let current = servers.get(player.key);
      if (!current) {
        current = {
          player,
          serves: 0,
          matches: new Set<string>(),
          turns: 0,
          maxConsecutiveServes: 0,
          aces: 0,
          positive: 0,
          errors: 0,
          startZones: new Map<string, MutableCount>(),
          targetZones: new Map<string, MutableCount>(),
          types: new Map<string, MutableCount>(),
          routes: new Map<string, MutableRoute>(),
          byType: new Map<string, MutableTypeBreakdown>(),
        };
        servers.set(player.key, current);
      }
      return current;
    };

    const recordTurn = (serverKey: string | null, runLength: number) => {
      if (!serverKey || runLength <= 0) return;
      const server = servers.get(serverKey);
      if (!server) return;
      server.turns += 1;
      if (runLength > server.maxConsecutiveServes) {
        server.maxConsecutiveServes = runLength;
      }
    };

    // Group rallies by set and order by rallyNumber.
    const ralliesBySet = new Map<number, RallyStats[]>();
    for (const rally of match.rallies) {
      const list = ralliesBySet.get(rally.setNumber) ?? [];
      list.push(rally);
      ralliesBySet.set(rally.setNumber, list);
    }

    const sideOutByRally = new Map<string, ReturnType<typeof extractSideOutSequences>[number]>();
    for (const sequence of extractSideOutSequences(match.rallies)) {
      if (sequence.teamSide === side) {
        sideOutByRally.set(`${sequence.setNumber}:${sequence.rallyNumber}`, sequence);
      }
    }

    for (const [, setRallies] of [...ralliesBySet.entries()].sort((left, right) => left[0] - right[0])) {
      const ordered = [...setRallies].sort((left, right) => left.rallyNumber - right.rallyNumber);
      let activeServerKey: string | null = null;
      let currentRun = 0;
      let prevRallyConcededBreak = false;
      let concededBreakInCurrentRotation = false;
      let nextServeIsAfterBreak = false;

      for (const rally of ordered) {
        const touches = sortedTouches(rally);
        const serve = touches.find((touch) => touch.skill === 'serve');
        const receive = touches.find((touch) => touch.skill === 'receive');
        const servingSide = serve?.teamSide ?? rally.servingTeam;

        if (servingSide === side) {
          const serverPlayer = serve?.playerId ? playerById.get(serve.playerId) : undefined;
          if (serverPlayer && serve) {
            const server = getOrCreateServer(serverPlayer);
            server.serves += 1;
            server.matches.add(matchId);
            if (serve.evaluation === '#') server.aces += 1;
            if (serve.evaluation === '#' || serve.evaluation === '+' || serve.evaluation === '/') {
              server.positive += 1;
            }
            if (serve.evaluation === '=') server.errors += 1;

            const startZone = serveStartZone(serve);
            const targetZone = serveTargetZone(serve, receive);
            const type = serveTypeValue(serve, receive);
            addCount(server.startZones, startZone, matchId);
            addCount(server.targetZones, targetZone, matchId);
            addCount(server.types, type, matchId);

            const typed = server.byType.get(type ?? '') ?? { serves: 0, matches: new Set<string>(), aces: 0, hard: 0, errors: 0, routes: new Map<string, MutableRoute>() };
            typed.serves += 1;
            typed.matches.add(matchId);
            if (serve.evaluation === '#') typed.aces += 1;
            if (serve.evaluation === '+' || serve.evaluation === '/') typed.hard += 1;
            if (serve.evaluation === '=') typed.errors += 1;
            server.byType.set(type ?? '', typed);

            if (startZone && targetZone) {
              addRoute(server.routes, startZone, targetZone, matchId, serve.evaluation);
              addRoute(typed.routes, startZone, targetZone, matchId, serve.evaluation);
            }

            if (activeServerKey === serverPlayer.key) {
              currentRun += 1;
            } else {
              recordTurn(activeServerKey, currentRun);
              activeServerKey = serverPlayer.key;
              currentRun = 1;
            }
          } else {
            recordTurn(activeServerKey, currentRun);
            activeServerKey = null;
            currentRun = 0;
          }

          if (nextServeIsAfterBreak && serve) {
            serveAfterBreakCount += 1;
            serveAfterBreakMatches.add(matchId);
            if (serve.evaluation === '#') serveAfterBreakAces += 1;
            if (serve.evaluation === '=') serveAfterBreakErrors += 1;
            addCount(serveAfterBreakTypes, serveTypeValue(serve, receive), matchId);
            addCount(serveAfterBreakZones, serveTargetZone(serve, receive), matchId);
            nextServeIsAfterBreak = false;
          }

          prevRallyConcededBreak = false;
          concededBreakInCurrentRotation = false;
        } else if (servingSide === otherSide) {
          // Opponent is receiving in this rally.
          recordTurn(activeServerKey, currentRun);
          activeServerKey = null;
          currentRun = 0;

          if (prevRallyConcededBreak) {
            const sequence = sideOutByRally.get(`${rally.setNumber}:${rally.rallyNumber}`);
            const attack = sequence?.attack;
            const attacker = attack?.playerId ? playerById.get(attack.playerId) : undefined;
            if (attack && attacker) {
              afterBreakAttempts += 1;
              afterBreakMatches.add(matchId);
              const entry = breakAttackers.get(attacker.key) ?? {
                player: attacker,
                attempts: 0,
                kills: 0,
                errors: 0,
                matches: new Set<string>(),
              };
              entry.attempts += 1;
              entry.matches.add(matchId);
              if (attack.evaluation === '#') entry.kills += 1;
              if (attack.evaluation === '=' || attack.evaluation === '/') entry.errors += 1;
              breakAttackers.set(attacker.key, entry);
            }
          }

          if (rally.pointWinner === otherSide) {
            prevRallyConcededBreak = true;
            concededBreakInCurrentRotation = true;
            nextServeIsAfterBreak = false;
          } else if (rally.pointWinner === side) {
            prevRallyConcededBreak = false;
            nextServeIsAfterBreak = concededBreakInCurrentRotation;
            concededBreakInCurrentRotation = false;
          } else {
            prevRallyConcededBreak = false;
          }
        }
      }

      recordTurn(activeServerKey, currentRun);
    }
  }

  return {
    servers: [...servers.values()]
      .map((server): ServerReportMetrics => {
        const startZones = finishDistribution(server.startZones, server.serves);
        const targetZones = finishDistribution(server.targetZones, server.serves);
        const types = finishDistribution(server.types, server.serves);
        const routeTotal = [...server.routes.values()].reduce((sum, entry) => sum + entry.count, 0);
        const routes = [...server.routes.values()]
          .map((route): ServeRouteMetrics => ({
            startZone: route.startZone,
            targetZone: route.targetZone,
            count: route.count,
            matches: route.matches.size,
            share: routeTotal > 0 ? route.count / routeTotal : 0,
            aces: route.aces,
            errors: route.errors,
          }))
          .sort((left, right) => right.count - left.count || left.startZone.localeCompare(right.startZone) || left.targetZone.localeCompare(right.targetZone));
        return {
          player: server.player,
          serves: server.serves,
          matches: server.matches.size,
          turns: server.turns,
          averageConsecutiveServes: server.turns > 0 ? server.serves / server.turns : null,
          maxConsecutiveServes: server.maxConsecutiveServes,
          aces: ratio(server.aces, server.serves),
          positive: ratio(server.positive, server.serves),
          errors: ratio(server.errors, server.serves),
          startZones,
          targetZones,
          types,
          routes,
          typeBreakdown: [...server.byType.entries()]
            .map(([type, entry]): ServeTypeBreakdown => ({
              type,
              serves: entry.serves,
              matches: entry.matches.size,
              aces: ratio(entry.aces, entry.serves),
              hard: ratio(entry.hard, entry.serves),
              errors: ratio(entry.errors, entry.serves),
              routes: finishRoutes(entry.routes),
            }))
            .sort((left, right) => right.serves - left.serves || left.type.localeCompare(right.type)),
        };
      })
      .sort((left, right) => (
        right.serves - left.serves
        || compareReportPlayers(left.player, right.player)
      )),
    breakReaction: {
      afterBreakAttacks: {
        attempts: afterBreakAttempts,
        matches: afterBreakMatches.size,
        attackers: [...breakAttackers.values()]
          .map((entry): BreakReactionAttackerMetrics => ({
            player: entry.player,
            attempts: entry.attempts,
            matches: entry.matches.size,
            share: ratio(entry.attempts, afterBreakAttempts),
            kill: ratio(entry.kills, entry.attempts),
            errors: ratio(entry.errors, entry.attempts),
          }))
          .sort((left, right) => (
            right.attempts - left.attempts
            || (right.kill.rate ?? 0) - (left.kill.rate ?? 0)
            || compareReportPlayers(left.player, right.player)
          )),
      },
      serveAfterBreak: {
        serves: serveAfterBreakCount,
        matches: serveAfterBreakMatches.size,
        aces: ratio(serveAfterBreakAces, serveAfterBreakCount),
        errors: ratio(serveAfterBreakErrors, serveAfterBreakCount),
        types: finishDistribution(serveAfterBreakTypes, serveAfterBreakCount),
        targetZones: finishDistribution(serveAfterBreakZones, serveAfterBreakCount),
      },
    },
  };
}

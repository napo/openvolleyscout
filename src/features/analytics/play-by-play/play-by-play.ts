import type { PlayerRoleLookup } from '@src/domain/lineup/setter-after-substitution';
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import { canonicalPointEventIds, createCourtOpsReader } from '@src/domain/events/court-ops';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchStats, RallyStats } from '@src/features/scouting/model/match-stats';
import { isRallyBreakPoint } from '../rally-phase/rally-phase-classifier';
import { resolvePointWinnerFromTouch } from '@src/features/scouting/model/scoring-rules';
import { applyCourtOpToLineups, setterPositionOf, type CourtLineups } from '@src/features/scouting/model/rally-rotations';

export interface PlayByPlayRow {
  id: string;
  kind: 'point' | 'timeout' | 'correction' | 'penalty';
  rallyNumber?: number;
  homeScore: number;
  awayScore: number;
  teamSide: TeamSide | null;
  servingTeam: TeamSide | null;
  serverId?: string;
  breakPoint: boolean;
  rotations: Record<TeamSide, number | null>;
  details: Record<TeamSide, BallTouch | null>;
  correction?: Extract<MatchEvent, { type: 'manual_correction' }>['correction'];
}
export interface PlayByPlaySet {
  setNumber: number;
  rows: PlayByPlayRow[];
  pointCount: number;
  touchCount: number;
  finalScore: { home: number; away: number };
  incomplete: boolean;
}

/** Only recorded, outcome-consistent decisive contacts are attributed to people. */
export function decisiveContacts(rally: RallyStats): PlayByPlayRow['details'] {
  const details: PlayByPlayRow['details'] = { home: null, away: null };
  if (!rally.pointWinner) return details;
  for (const touch of rally.touches) {
    if (touch.source === 'inferred' || touch.inferredCandidate || touch.pendingInference) continue;
    const blocked = touch.skill === 'attack' && touch.evaluation === '/' && touch.teamSide !== rally.pointWinner;
    if (resolvePointWinnerFromTouch(touch) === rally.pointWinner || blocked) details[touch.teamSide] = touch;
  }
  return details;
}

/** Chronological read model; corrections and penalties are not invented rallies. */
export function buildPlayByPlay(stats: Pick<MatchStats, 'rallyStats' | 'setStats'>, eventLog: readonly MatchEvent[], roleOf?: PlayerRoleLookup): PlayByPlaySet[] {
  const seenIds = new Set<string>();
  const events = eventLog.filter((event) => { if (seenIds.has(event.id)) return false; seenIds.add(event.id); return true; });
  const canonicalPoints = canonicalPointEventIds(events);
  const canonicalEvents = events.filter((event) => event.type !== 'point_awarded' || canonicalPoints.has(event.id));
  const setNumbers = new Set([...stats.setStats.map((set) => set.setNumber), ...stats.rallyStats.map((rally) => rally.setNumber)]);
  events.forEach((event) => { if ('setNumber' in event && typeof event.setNumber === 'number') setNumbers.add(event.setNumber); });
  return [...setNumbers].sort((a, b) => a - b).map((setNumber) => {
    const rallies = stats.rallyStats.filter((rally) => rally.setNumber === setNumber);
    const byRally = new Map(rallies.map((rally) => [rally.rallyNumber, rally]));
    const timeline = canonicalEvents.map((event, order) => ({ event, order })).filter(({ event }) => 'setNumber' in event ? event.setNumber === setNumber : event.type === 'touch_recorded' && event.touch.setNumber === setNumber);
    const recordedPoints = new Set(timeline.filter(({ event }) => event.type === 'point_awarded').map(({ event }) => 'rallyNumber' in event ? event.rallyNumber : undefined));
    // Legacy imports can supply terminal touches without explicit point events.
    rallies.filter((rally) => rally.pointWinner && !recordedPoints.has(rally.rallyNumber)).forEach((rally, index) => {
      const positions = timeline.filter(({ event }) => event.type === 'touch_recorded' && event.touch.rallyNumber === rally.rallyNumber).map(({ order }) => order);
      timeline.push({ order: positions.length ? Math.max(...positions) + .5 : events.length + index,
        event: { id: `derived-${setNumber}-${rally.rallyNumber}`, type: 'point_awarded', setNumber, rallyNumber: rally.rallyNumber, teamSide: rally.pointWinner!, createdAt: 0 } });
    });
    timeline.sort((a, b) => a.order - b.order);
    // Score, serve and rotations follow the shared reading of the events (domain/events/court-ops),
    // the same one behind the match report.
    const court = createCourtOpsReader();
    let lineups: CourtLineups = { home: null, away: null };
    const rows: PlayByPlayRow[] = [];
    const pointKeys = new Set<number>();
    let officialScore: PlayByPlaySet['finalScore'] | null = null;
    const rotation = (side: TeamSide): number | null => setterPositionOf(lineups[side]) ?? null;
    const applyToCourt = (event: MatchEvent) => {
      for (const op of court.read(event)) lineups = applyCourtOpToLineups(lineups, op, roleOf);
    };
    for (const { event } of timeline) {
      if (event.type === 'set_ended') {
        officialScore = { home: event.homeScore, away: event.awayScore };
      } else if (event.type === 'point_awarded' || event.type === 'red_card_point' || event.type === 'timeout_called' || event.type === 'manual_correction') {
        const isPoint = event.type === 'point_awarded';
        if (isPoint && pointKeys.has(event.rallyNumber!)) continue;
        const rally = 'rallyNumber' in event && event.rallyNumber ? byRally.get(event.rallyNumber) : undefined;
        const serveTouch = rally?.touches.find((touch) => touch.skill === 'serve' && touch.source !== 'inferred');
        const beforeServing = serveTouch?.teamSide ?? court.servingTeam;
        const firstTouch = isPoint ? rally?.touches[0] : undefined;
        // The rotations the point (or the correction) was played in: before the event moves them.
        const rotations = {
          home: validRotation(firstTouch?.homeSetterPosition) ?? rotation('home'),
          away: validRotation(firstTouch?.awaySetterPosition) ?? rotation('away'),
        };
        const details = isPoint && rally ? decisiveContacts({ ...rally, pointWinner: event.teamSide }) : { home: null, away: null };
        if (isPoint) pointKeys.add(event.rallyNumber);
        // A correction shows the court it leaves; a point shows who served it, so it rotates after its row.
        if (!isPoint && event.type !== 'red_card_point') applyToCourt(event);
        const score = isPoint || event.type === 'red_card_point'
          ? { ...court.score, [event.teamSide]: court.score[event.teamSide] + 1 }
          : court.score;
        rows.push({ id: event.id, kind: isPoint ? 'point' : event.type === 'red_card_point' ? 'penalty' : event.type === 'timeout_called' ? 'timeout' : 'correction',
          rallyNumber: event.rallyNumber, ...{ homeScore: score.home, awayScore: score.away }, teamSide: event.teamSide,
          servingTeam: beforeServing, serverId: serveTouch?.playerId ?? (beforeServing ? lineups[beforeServing]?.slots.find((slot) => slot.courtPosition === 1)?.playerId : undefined),
          breakPoint: isPoint && Boolean(rally) && isRallyBreakPoint({ ...rally!, servingTeam: beforeServing, pointWinner: event.teamSide }), rotations, details,
          ...(event.type === 'manual_correction' ? { correction: event.correction } : {}),
        });
        if (isPoint || event.type === 'red_card_point') applyToCourt(event);
      } else {
        applyToCourt(event);
      }
    }
    const score = court.score;
    const summary = stats.setStats.find((set) => set.setNumber === setNumber);
    const finalScore = officialScore ?? (summary && !rows.some((row) => row.kind === 'correction' || row.kind === 'penalty') ? { home: summary.homeScore, away: summary.awayScore } : score);
    return { setNumber, rows, pointCount: rows.filter((row) => row.kind === 'point').length,
      touchCount: rallies.filter((rally) => pointKeys.has(rally.rallyNumber)).reduce((n, rally) => n + rally.touches.filter((touch) => touch.source !== 'inferred').length, 0),
      finalScore, incomplete: finalScore.home !== score.home || finalScore.away !== score.away };
  });
}
function validRotation(value?: number): number | null { return value && Number.isInteger(value) && value >= 1 && value <= 6 ? value : null; }

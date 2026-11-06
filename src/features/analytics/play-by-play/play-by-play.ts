import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import { createActiveLineup, type ActiveLineup } from '@src/domain/lineup';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchStats, RallyStats } from '@src/features/scouting/model/match-stats';
import { isRallyBreakPoint } from '../rally-phase/rally-phase-classifier';
import { resolvePointWinnerFromTouch } from '@src/features/scouting/model/scoring-rules';
import { rotateLineupBackward, rotateLineupForSideOut, shouldRotateLineupAfterPoint } from '@src/features/scouting/model/rally-transition';
import { applyNormalSubstitutionToLineup, applyLiberoReplacementToLineup } from '@src/features/scouting/model/personnel';

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
export function buildPlayByPlay(stats: Pick<MatchStats, 'rallyStats' | 'setStats'>, eventLog: readonly MatchEvent[]): PlayByPlaySet[] {
  const seenIds = new Set<string>();
  const events = eventLog.filter((event) => { if (seenIds.has(event.id)) return false; seenIds.add(event.id); return true; });
  const canonicalPoints = new Map<string, Extract<MatchEvent, { type: 'point_awarded' }>>();
  events.forEach((event) => {
    if (event.type !== 'point_awarded') return;
    const key = `${event.setNumber}:${event.rallyNumber}`;
    if ((canonicalPoints.get(key)?.createdAt ?? -Infinity) <= event.createdAt) canonicalPoints.set(key, event);
  });
  const canonicalEvents = events.filter((event) => event.type !== 'point_awarded' || canonicalPoints.get(`${event.setNumber}:${event.rallyNumber}`)?.id === event.id);
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
    let score = { home: 0, away: 0 };
    let serving: TeamSide | null = null;
    let lineups: Record<TeamSide, ActiveLineup | null> = { home: null, away: null };
    const rows: PlayByPlayRow[] = [];
    const pointKeys = new Set<number>();
    let officialScore: PlayByPlaySet['finalScore'] | null = null;
    const rotation = (side: TeamSide): number | null => {
      const lineup = lineups[side];
      return lineup?.setterPlayerId ? lineup.slots.find((slot) => slot.playerId === lineup.setterPlayerId)?.courtPosition ?? null : null;
    };
    for (const { event } of timeline) {
      if (event.type === 'set_started') {
        serving = event.servingTeam;
        lineups = { home: createActiveLineup(event.homeLineup, { servingTeam: serving }), away: createActiveLineup(event.awayLineup, { servingTeam: serving }) };
      } else if (event.type === 'set_ended') {
        officialScore = { home: event.homeScore, away: event.awayScore };
      } else if (event.type === 'substitution_made' || event.type === 'libero_replacement_made') {
        const current = lineups[event.teamSide];
        if (current) lineups[event.teamSide] = (event.type === 'substitution_made' ? applyNormalSubstitutionToLineup(current, event) : applyLiberoReplacementToLineup(current, event)) ?? current;
      } else if (event.type === 'setter_assigned') {
        const current = lineups[event.teamSide];
        if (current) lineups[event.teamSide] = { ...current, setterPlayerId: event.setterPlayerId };
      } else if (event.type === 'point_awarded' || event.type === 'red_card_point' || event.type === 'timeout_called' || event.type === 'manual_correction') {
        const isPoint = event.type === 'point_awarded';
        if (isPoint && pointKeys.has(event.rallyNumber!)) continue;
        const rally = 'rallyNumber' in event && event.rallyNumber ? byRally.get(event.rallyNumber) : undefined;
        const serveTouch = rally?.touches.find((touch) => touch.skill === 'serve' && touch.source !== 'inferred');
        const beforeServing = serveTouch?.teamSide ?? serving;
        const firstTouch = isPoint ? rally?.touches[0] : undefined;
        const rotations = {
          home: validRotation(firstTouch?.homeSetterPosition) ?? rotation('home'),
          away: validRotation(firstTouch?.awaySetterPosition) ?? rotation('away'),
        };
        const details = isPoint && rally ? decisiveContacts({ ...rally, pointWinner: event.teamSide }) : { home: null, away: null };
        if (isPoint || event.type === 'red_card_point') {
          if (isPoint) pointKeys.add(event.rallyNumber);
          score = { ...score, [event.teamSide]: score[event.teamSide] + 1 };
        }
        if (event.type === 'manual_correction') {
          if (event.correction === 'point_added') score = { ...score, [event.teamSide]: score[event.teamSide] + 1 };
          if (event.correction === 'point_removed') score = { ...score, [event.teamSide]: Math.max(0, score[event.teamSide] - 1) };
          const current = lineups[event.teamSide];
          if (current && ['rotation_forward', 'rotation_backward'].includes(event.correction)) lineups[event.teamSide] = event.correction === 'rotation_forward' ? rotateLineupForSideOut(current) : rotateLineupBackward(current);
          if (event.correction === 'serve_assigned') serving = event.teamSide;
        }
        rows.push({ id: event.id, kind: isPoint ? 'point' : event.type === 'red_card_point' ? 'penalty' : event.type === 'timeout_called' ? 'timeout' : 'correction',
          rallyNumber: event.rallyNumber, ...{ homeScore: score.home, awayScore: score.away }, teamSide: event.teamSide,
          servingTeam: beforeServing, serverId: serveTouch?.playerId ?? (beforeServing ? lineups[beforeServing]?.slots.find((slot) => slot.courtPosition === 1)?.playerId : undefined),
          breakPoint: isPoint && Boolean(rally) && isRallyBreakPoint({ ...rally!, servingTeam: beforeServing, pointWinner: event.teamSide }), rotations, details,
          ...(event.type === 'manual_correction' ? { correction: event.correction } : {}),
        });
        if (isPoint || event.type === 'red_card_point') {
          const skip = isPoint && event.skipRotation;
          if (!skip && beforeServing && shouldRotateLineupAfterPoint(beforeServing, event.teamSide)) {
            const current = lineups[event.teamSide];
            if (current) lineups[event.teamSide] = rotateLineupForSideOut(current);
          }
          serving = event.teamSide;
        }
      }
    }
    const summary = stats.setStats.find((set) => set.setNumber === setNumber);
    const finalScore = officialScore ?? (summary && !rows.some((row) => row.kind === 'correction' || row.kind === 'penalty') ? { home: summary.homeScore, away: summary.awayScore } : score);
    return { setNumber, rows, pointCount: rows.filter((row) => row.kind === 'point').length,
      touchCount: rallies.filter((rally) => pointKeys.has(rally.rallyNumber)).reduce((n, rally) => n + rally.touches.filter((touch) => touch.source !== 'inferred').length, 0),
      finalScore, incomplete: finalScore.home !== score.home || finalScore.away !== score.away };
  });
}
function validRotation(value?: number): number | null { return value && Number.isInteger(value) && value >= 1 && value <= 6 ? value : null; }

/** Central graph shares one scale for all rows of a set, including page continuations. */
export function scoreGapSvg(row: Pick<PlayByPlayRow, 'homeScore' | 'awayScore'>, maxGap: number): string {
  const delta = row.homeScore - row.awayScore;
  const end = 40 + delta / Math.max(1, maxGap) * 35;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="18" viewBox="0 0 80 18"><path d="M40 0V18" stroke="#64748b" stroke-width="1"/><rect x="${Math.min(40, end)}" y="4" width="${Math.max(1, Math.abs(end - 40))}" height="10" fill="${delta >= 0 ? '#002554' : '#94a3b8'}"/><path d="M${end} 2V16" stroke="#111827" stroke-width="1"/></svg>`;
}

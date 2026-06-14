import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';
import {
  getTouchEventClockSeconds,
  resolveEventClockDomain,
  type EventClockDomain,
} from './video-sync';

/**
 * Rally phase from the perspective of the team performing the touch:
 * - `breakpoint`: the team is serving (a won rally is a break point);
 * - `sideout`: the team is receiving (a won rally is a side out / "point" phase).
 */
export type VideoRallyPhase = 'breakpoint' | 'sideout';

export interface VideoEventEntry {
  touchId: string;
  eventId: string;
  setNumber: number;
  rallyNumber: number;
  /** Score before the rally point is assigned. */
  homeScore: number;
  awayScore: number;
  teamSide: TeamSide;
  playerId?: string;
  skill: SkillType;
  evaluation?: SkillEvaluation;
  servingTeam: TeamSide | null;
  phase: VideoRallyPhase | null;
  homeSetterPosition?: number;
  awaySetterPosition?: number;
  /** Setter position of the team performing the touch. */
  setterPosition?: number;
  rallyWinner?: TeamSide;
  eventClockSeconds: number | null;
  touch: BallTouch;
}

export interface VideoEventIndex {
  entries: VideoEventEntry[];
  clockDomain: EventClockDomain;
  /** First serve of the match, the suggested calibration anchor. */
  firstServeEntry: VideoEventEntry | null;
  setNumbers: number[];
}

type RotationState = {
  /** Player ids ordered by court position P1..P6. */
  order: string[];
  setterPlayerId?: string;
};

function createRotationState(lineup: StartingLineup | undefined): RotationState {
  if (!lineup) return { order: [] };
  const order = [...lineup.slots]
    .sort((left, right) => left.courtPosition - right.courtPosition)
    .map((slot) => slot.playerId);
  return { order, setterPlayerId: lineup.setterPlayerId };
}

function rotate(state: RotationState): void {
  if (state.order.length < 6) return;
  state.order.push(state.order.shift() as string);
}

function getSetterPosition(state: RotationState): number | undefined {
  if (!state.setterPlayerId) return undefined;
  const index = state.order.indexOf(state.setterPlayerId);
  return index >= 0 ? index + 1 : undefined;
}

function replacePlayer(state: RotationState, playerOutId: string, playerInId: string): void {
  const index = state.order.indexOf(playerOutId);
  if (index >= 0) {
    state.order[index] = playerInId;
  }
  if (state.setterPlayerId === playerOutId) {
    state.setterPlayerId = playerInId;
  }
}

/**
 * Apply DataVolley Smart Time rules within a completed rally.
 *
 * Smart Time compensates for operator input lag in live scouting sessions.
 * It applies only to touches that carry no DV-provided timestamp
 * (no `recordedAtTime` and no `videoTimeSeconds`), so imported DVW files —
 * where DV itself has already applied Smart Time — are left untouched.
 *
 * Rules (matching DataVolley §6 Smart Time):
 *   • Receive  → serve's event clock
 *   • Set      → nearest following attack's event clock − 1 s
 *   • Block/Dig → same attack's event clock
 */
function applySmartTime(rallyEntries: VideoEventEntry[]): void {
  const qualifies = (entry: VideoEventEntry): boolean =>
    entry.touch.recordedAtTime === undefined
    && entry.touch.videoTimeSeconds === undefined
    && entry.eventClockSeconds !== null;

  if (!rallyEntries.some(qualifies)) return;

  const sorted = [...rallyEntries].sort((a, b) => a.touch.sequenceNumber - b.touch.sequenceNumber);

  // Serve group: every receive after the serve inherits the serve's timecode.
  const serveEntry = sorted.find((e) => e.skill === 'serve' && qualifies(e));
  if (serveEntry !== undefined) {
    const serveT = serveEntry.eventClockSeconds as number;
    for (const entry of sorted) {
      if (entry.skill === 'receive' && qualifies(entry)) {
        entry.eventClockSeconds = serveT;
      }
    }
  }

  // Attack cycles: for each qualifying attack, fix the preceding set and the
  // following block/dig touches to the attack's timecode (set gets attack − 1 s).
  for (let i = 0; i < sorted.length; i++) {
    const attackEntry = sorted[i];
    if (attackEntry.skill !== 'attack' || !qualifies(attackEntry)) continue;
    const attackT = attackEntry.eventClockSeconds as number;

    // The nearest set before this attack (stop scanning at the previous attack).
    for (let j = i - 1; j >= 0; j--) {
      if (sorted[j].skill === 'attack') break;
      if (sorted[j].skill === 'set' && qualifies(sorted[j])) {
        sorted[j].eventClockSeconds = Math.max(0, attackT - 1);
        break;
      }
    }

    // Block/dig immediately after this attack (stop at the next attack).
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].skill === 'attack') break;
      if ((sorted[j].skill === 'block' || sorted[j].skill === 'dig') && qualifies(sorted[j])) {
        sorted[j].eventClockSeconds = attackT;
      }
    }
  }
}

function collectTouches(events: readonly MatchEvent[]): BallTouch[] {
  const touches: BallTouch[] = [];
  events.forEach((event) => {
    if (event.type === 'touch_recorded') {
      touches.push(event.touch);
    }
  });
  return touches;
}

/**
 * Walk the project event log and build a flat, video-oriented list of touches
 * enriched with rally context (score, serving team, phase, setter positions).
 */
export function buildVideoEventIndex(events: readonly MatchEvent[]): VideoEventIndex {
  const clockDomain = resolveEventClockDomain(collectTouches(events));
  const entries: VideoEventEntry[] = [];
  const setNumbers = new Set<number>();

  let homeScore = 0;
  let awayScore = 0;
  let servingTeam: TeamSide | null = null;
  let rotations: Record<TeamSide, RotationState> = {
    home: { order: [] },
    away: { order: [] },
  };
  let currentRallyEntries: VideoEventEntry[] = [];

  events.forEach((event) => {
    switch (event.type) {
      case 'set_started': {
        homeScore = 0;
        awayScore = 0;
        servingTeam = event.servingTeam;
        rotations = {
          home: createRotationState(event.homeLineup),
          away: createRotationState(event.awayLineup),
        };
        setNumbers.add(event.setNumber);
        currentRallyEntries = [];
        break;
      }
      case 'touch_recorded': {
        const touch = event.touch;
        const homeSetterPosition = touch.homeSetterPosition ?? getSetterPosition(rotations.home);
        const awaySetterPosition = touch.awaySetterPosition ?? getSetterPosition(rotations.away);
        const entry: VideoEventEntry = {
          touchId: touch.id,
          eventId: event.id,
          setNumber: touch.setNumber,
          rallyNumber: touch.rallyNumber,
          homeScore,
          awayScore,
          teamSide: touch.teamSide,
          playerId: touch.playerId,
          skill: touch.skill,
          evaluation: touch.evaluation,
          servingTeam,
          phase: servingTeam ? (touch.teamSide === servingTeam ? 'breakpoint' : 'sideout') : null,
          homeSetterPosition,
          awaySetterPosition,
          setterPosition: touch.teamSide === 'home' ? homeSetterPosition : awaySetterPosition,
          eventClockSeconds: getTouchEventClockSeconds(touch, clockDomain),
          touch,
        };
        setNumbers.add(touch.setNumber);
        entries.push(entry);
        currentRallyEntries.push(entry);
        break;
      }
      case 'point_awarded': {
        currentRallyEntries.forEach((entry) => {
          entry.rallyWinner = event.teamSide;
        });
        applySmartTime(currentRallyEntries);
        currentRallyEntries = [];

        if (event.teamSide === 'home') {
          homeScore += 1;
        } else {
          awayScore += 1;
        }

        if (servingTeam && event.teamSide !== servingTeam && !event.skipRotation) {
          rotate(rotations[event.teamSide]);
        }
        servingTeam = event.teamSide;
        break;
      }
      case 'substitution_made': {
        replacePlayer(rotations[event.teamSide], event.playerOutId, event.playerInId);
        break;
      }
      case 'libero_replacement_made': {
        replacePlayer(rotations[event.teamSide], event.playerOutId, event.playerInId);
        break;
      }
      default:
        break;
    }
  });

  // Handle the last rally if no point_awarded was recorded.
  applySmartTime(currentRallyEntries);

  const firstServeEntry = entries.find((entry) => entry.skill === 'serve') ?? null;

  return {
    entries,
    clockDomain,
    firstServeEntry,
    setNumbers: [...setNumbers].sort((left, right) => left - right),
  };
}

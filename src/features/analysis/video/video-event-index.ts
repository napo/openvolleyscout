import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchVideoAnalysis, VideoRallyTimingMode } from '@src/domain/video/types';
import {
  computeVideoSeconds,
  getTouchEventClockSeconds,
  resolveEventClockDomain,
  resolveSyncPointClocks,
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
  /** The intra-rally timing actually applied (the requested one, or the automatic choice). */
  rallyTimingMode: VideoRallyTimingMode;
  /**
   * False when the recorded clocks do not follow the pace of play: the match
   * was scouted from a video with pauses and rewinds, or typed after the fact.
   */
  clockFollowsPlay: boolean;
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

const SECONDS_PER_DAY = 24 * 60 * 60;

/** Typical attack-to-counter-attack time (dig, set, attack) when the recorded gaps cannot be trusted. */
const DEFAULT_COUNTER_ATTACK_STEP_SECONDS = 3.5;

/** Rallies needed before judging whether the recorded clocks follow the pace of play. */
const CLOCK_CHECK_MINIMUM_RALLIES = 5;
const CLOCK_CHECK_OFF_PACE_SHARE = 0.3;

/**
 * Whether the recorded clocks follow the pace of play. A match scouted from a
 * video (pauses, rewinds) or typed after the fact has rallies that last far
 * too long, or no time at all, for the touches they hold; the gaps between
 * touches then say nothing about where the action is in the video.
 */
export function recordedClockFollowsPlay(touches: readonly BallTouch[], domain: EventClockDomain): boolean {
  if (domain !== 'time-of-day') return true;
  const rallies = new Map<string, BallTouch[]>();
  touches.forEach((touch) => {
    const key = `${touch.setNumber}:${touch.rallyNumber}`;
    const rally = rallies.get(key);
    if (rally) rally.push(touch);
    else rallies.set(key, [touch]);
  });
  let checked = 0;
  let offPace = 0;
  rallies.forEach((rally) => {
    const clocks = [...rally]
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map((touch) => getTouchEventClockSeconds(touch, domain))
      .filter((clock): clock is number => clock !== null);
    if (clocks.length < 3) return;
    let duration = clocks[clocks.length - 1] - clocks[0];
    if (duration < -SECONDS_PER_DAY / 2) duration += SECONDS_PER_DAY;
    checked += 1;
    const tooLong = duration > clocks.length * 3 + 10;
    const tooShort = duration < 0 || (clocks.length >= 4 && duration < 2);
    if (tooLong || tooShort) offPace += 1;
  });
  return checked < CLOCK_CHECK_MINIMUM_RALLIES || offPace / checked < CLOCK_CHECK_OFF_PACE_SHARE;
}

/**
 * Option B: realistic intra-rally timing anchored to the rally's serve (`T0`).
 * Never overrides native DVW `videoTimeSeconds`. With `trustRecordedGaps`
 * false, counter-attacks follow a fixed cadence instead of the recorded gaps.
 */
function applyRealisticRallyTiming(rallyEntries: VideoEventEntry[], trustRecordedGaps: boolean): void {
  const qualifies = (entry: VideoEventEntry): boolean =>
    entry.touch.videoTimeSeconds === undefined && entry.eventClockSeconds !== null;

  if (!rallyEntries.some(qualifies)) return;

  const sorted = [...rallyEntries].sort((a, b) => a.touch.sequenceNumber - b.touch.sequenceNumber);
  const originalClock = new Map<VideoEventEntry, number>();
  for (const entry of sorted) {
    if (qualifies(entry)) {
      originalClock.set(entry, entry.eventClockSeconds as number);
    }
  }

  const serveEntry = sorted.find((e) => e.skill === 'serve' && qualifies(e));
  const firstQualifying = sorted.find(qualifies);
  if (!firstQualifying) return;
  const baseT = (serveEntry ?? firstQualifying).eventClockSeconds as number;

  if (serveEntry) {
    serveEntry.eventClockSeconds = baseT;
    for (const entry of sorted) {
      if (entry.skill === 'receive' && qualifies(entry)) {
        entry.eventClockSeconds = baseT + 1;
      }
    }
  }

  const assigned = new Set<VideoEventEntry>();
  if (serveEntry) assigned.add(serveEntry);
  for (const entry of sorted) {
    if (entry.skill === 'receive' && qualifies(entry)) assigned.add(entry);
  }

  let prevAttackOrig: number | null = null;
  let prevAttackT: number | null = null;
  const hasServeOrReceive = Boolean(serveEntry || sorted.some((e) => e.skill === 'receive' && qualifies(e)));

  for (let i = 0; i < sorted.length; i++) {
    const attackEntry = sorted[i];
    if (attackEntry.skill !== 'attack' || !qualifies(attackEntry)) continue;

    const origT = originalClock.get(attackEntry) as number;
    let attackT: number;
    if (prevAttackT === null) {
      attackT = hasServeOrReceive ? baseT + 3 : baseT + 1;
    } else if (!trustRecordedGaps) {
      attackT = prevAttackT + DEFAULT_COUNTER_ATTACK_STEP_SECONDS;
    } else {
      let rawDelta = origT - (prevAttackOrig as number);
      if (rawDelta < -SECONDS_PER_DAY / 2) rawDelta += SECONDS_PER_DAY;
      const step = Number.isFinite(rawDelta) && rawDelta >= 0 ? Math.min(5, Math.max(2, rawDelta)) : 3;
      attackT = prevAttackT + step;
    }

    attackEntry.eventClockSeconds = attackT;
    assigned.add(attackEntry);
    prevAttackOrig = origT;
    prevAttackT = attackT;

    // Preceding set -> attack - 1 s (never earlier than baseT).
    for (let j = i - 1; j >= 0; j--) {
      const candidate = sorted[j];
      if (candidate.skill === 'attack' || candidate.skill === 'serve' || candidate.skill === 'receive') break;
      if (candidate.skill === 'set' && qualifies(candidate)) {
        candidate.eventClockSeconds = Math.max(baseT, attackT - 1);
        assigned.add(candidate);
        break;
      }
    }

    // Following block/dig -> same second as the attack.
    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      if (candidate.skill === 'attack') break;
      if ((candidate.skill === 'block' || candidate.skill === 'dig') && qualifies(candidate)) {
        candidate.eventClockSeconds = attackT;
        assigned.add(candidate);
      }
    }
  }

  // Ensure any remaining ungrouped touches (e.g. freeball, cover, trailing set) stay monotonic.
  // They never run past the next touch that already has its place.
  const timed = sorted.filter(qualifies);
  let cursor = baseT;
  timed.forEach((entry, index) => {
    if (assigned.has(entry)) {
      cursor = Math.max(cursor, entry.eventClockSeconds as number);
      return;
    }
    const nextAssigned = timed.slice(index + 1).find((candidate) => assigned.has(candidate));
    const ceiling = nextAssigned ? (nextAssigned.eventClockSeconds as number) : Number.POSITIVE_INFINITY;
    cursor = Math.max(cursor, Math.min(cursor + 1, ceiling));
    entry.eventClockSeconds = cursor;
  });
}

export interface BuildVideoEventIndexOptions {
  /**
   * Missing: 'realistic' when the recorded clocks do not follow the pace of
   * play (see `recordedClockFollowsPlay`), otherwise 'recorded'.
   */
  rallyTimingMode?: VideoRallyTimingMode;
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
export function buildVideoEventIndex(
  events: readonly MatchEvent[],
  options?: BuildVideoEventIndexOptions,
): VideoEventIndex {
  const allTouches = collectTouches(events);
  const clockDomain = resolveEventClockDomain(allTouches);
  const clockFollowsPlay = recordedClockFollowsPlay(allTouches, clockDomain);
  const rallyTimingMode = options?.rallyTimingMode ?? (clockFollowsPlay ? 'recorded' : 'realistic');
  const applyRallyTiming = (rally: VideoEventEntry[]) => {
    if (rallyTimingMode === 'realistic') {
      applyRealisticRallyTiming(rally, clockFollowsPlay);
    } else {
      applySmartTime(rally);
    }
  };
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
        applyRallyTiming(currentRallyEntries);
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
  applyRallyTiming(currentRallyEntries);

  const firstServeEntry = entries.find((entry) => entry.skill === 'serve') ?? null;

  return {
    entries,
    clockDomain,
    rallyTimingMode,
    clockFollowsPlay,
    firstServeEntry,
    setNumbers: [...setNumbers].sort((left, right) => left - right),
  };
}

/** The event clock of every action of the index, by touch id. */
export function buildTouchClockMap(index: VideoEventIndex): Map<string, number | null> {
  return new Map(index.entries.map((entry) => [entry.touchId, entry.eventClockSeconds]));
}

/**
 * Video position of a touch exactly as the Video tab plays it: same intra-rally
 * timing, same sync points. For exports and links built outside the tab.
 * A touch missing from the event log is timed from its own recorded clock.
 */
export function createTouchVideoSecondsResolver(
  events: readonly MatchEvent[],
  analysis: Pick<MatchVideoAnalysis, 'syncPoints' | 'syncInterpolation' | 'rallyTimingMode'>,
): (touch: BallTouch) => number | null {
  const index = buildVideoEventIndex(events, { rallyTimingMode: analysis.rallyTimingMode });
  const clocks = buildTouchClockMap(index);
  const syncPoints = resolveSyncPointClocks(analysis.syncPoints, clocks);
  return (touch) => computeVideoSeconds(
    clocks.has(touch.id) ? clocks.get(touch.id) ?? null : getTouchEventClockSeconds(touch, index.clockDomain),
    syncPoints,
    index.clockDomain,
    analysis.syncInterpolation ?? 'step',
    touch.id,
  );
}

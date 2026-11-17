// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchEvent } from '../../../domain/events/types';
import type { Player } from '../../../domain/roster/types';
import type { BallTouch } from '../../../domain/touch/types';
import type { ParsedTouchCode } from './code-parser';
import { formatDataVolleyTime } from './pending-touch-builder';

export interface CodeListInsertionContext {
  setNumber: number;
  rallyNumber: number;
  insertAt: number;
}

export type CodeListFitWarning = 'second_serve' | null;

/**
 * Resolves the target set, rally, and eventLog splice index when inserting
 * before `targetEventIndex` (or appending at the end when `null`).
 */
export function resolveCodeListInsertionContext(
  eventLog: readonly MatchEvent[],
  targetEventIndex: number | null,
): CodeListInsertionContext {
  if (targetEventIndex !== null && targetEventIndex >= 0 && targetEventIndex < eventLog.length) {
    const target = eventLog[targetEventIndex];
    if (target.type === 'touch_recorded') {
      return {
        setNumber: target.touch.setNumber,
        rallyNumber: target.touch.rallyNumber ?? 1,
        insertAt: targetEventIndex,
      };
    }
    if (target.type === 'set_started') {
      return {
        setNumber: target.setNumber,
        rallyNumber: 1,
        insertAt: targetEventIndex + 1,
      };
    }
    if ('setNumber' in target && typeof target.setNumber === 'number') {
      const rally = 'rallyNumber' in target && typeof target.rallyNumber === 'number'
        ? target.rallyNumber
        : 1;
      return {
        setNumber: target.setNumber,
        rallyNumber: rally > 0 ? rally : 1,
        insertAt: targetEventIndex,
      };
    }
    return { setNumber: 1, rallyNumber: 1, insertAt: targetEventIndex };
  }

  // Appending at the end: find the last set/rally context.
  let setNumber = 1;
  let rallyNumber = 1;
  let insertAt = eventLog.length;

  for (let i = eventLog.length - 1; i >= 0; i -= 1) {
    const ev = eventLog[i];
    if (ev.type === 'touch_recorded') {
      setNumber = ev.touch.setNumber;
      rallyNumber = ev.touch.rallyNumber ?? 1;
      break;
    }
    if (ev.type === 'point_awarded' || ev.type === 'rally_ended') {
      setNumber = ev.setNumber ?? 1;
      rallyNumber = ev.rallyNumber && ev.rallyNumber > 0 ? ev.rallyNumber : 1;
      // When adding at the end of a just-finished rally, place before the point/rally_ended row
      // if no new touches followed it; otherwise append at the end of the log.
      if (i === eventLog.length - 1) {
        let j = i;
        while (j > 0 && (eventLog[j - 1].type === 'point_awarded' || eventLog[j - 1].type === 'rally_ended')) {
          j -= 1;
        }
        insertAt = j;
      }
      break;
    }
    if (ev.type === 'set_started') {
      setNumber = ev.setNumber;
      rallyNumber = 1;
      break;
    }
  }

  return { setNumber, rallyNumber, insertAt };
}

/**
 * Non-blocking check: warns if the inserted code is a second serve in the same rally,
 * without ever blocking the scout from recording it.
 */
export function checkInsertedCodeRallyFit(
  eventLog: readonly MatchEvent[],
  context: CodeListInsertionContext,
  parsed: ParsedTouchCode,
): CodeListFitWarning {
  if (!parsed.valid || parsed.skill !== 'serve') return null;
  const hasServeInRally = eventLog.some(
    (ev) => ev.type === 'touch_recorded'
      && ev.touch.setNumber === context.setNumber
      && (ev.touch.rallyNumber ?? 1) === context.rallyNumber
      && ev.touch.skill === 'serve',
  );
  return hasServeInRally ? 'second_serve' : null;
}

/**
 * Re-numbers `touch.sequenceNumber` sequentially (1..N) inside every rally.
 */
export function renumberRallySequences(eventLog: readonly MatchEvent[]): MatchEvent[] {
  const counts = new Map<string, number>();
  return eventLog.map((ev) => {
    if (ev.type !== 'touch_recorded') return ev;
    const key = `${ev.touch.setNumber}:${ev.touch.rallyNumber ?? 1}`;
    const nextSeq = (counts.get(key) ?? 0) + 1;
    counts.set(key, nextSeq);
    if (ev.touch.sequenceNumber === nextSeq) return ev;
    return {
      ...ev,
      touch: {
        ...ev.touch,
        sequenceNumber: nextSeq,
      },
    };
  });
}

/**
 * Builds a `touch_recorded` MatchEvent from a parsed DataVolley code.
 * Compound codes are not applied automatically on insertion; existing in-place
 * edits in MatchCodeListPanel also replace only the edited touch.
 */
export function buildInsertedTouchEvent(input: {
  parsed: ParsedTouchCode;
  homePlayers: readonly Player[];
  awayPlayers: readonly Player[];
  setNumber: number;
  rallyNumber: number;
  now?: number;
}): Extract<MatchEvent, { type: 'touch_recorded' }> {
  const { parsed, homePlayers, awayPlayers, setNumber, rallyNumber } = input;
  const now = input.now ?? Date.now();
  const recordedAtIso = new Date(now).toISOString();
  const recordedAtTime = formatDataVolleyTime(recordedAtIso);
  const teamSide = parsed.teamSide ?? 'home';
  const players = teamSide === 'home' ? homePlayers : awayPlayers;
  const player = parsed.jerseyNumber !== undefined
    ? players.find((p) => p.jerseyNumber === parsed.jerseyNumber)
    : undefined;

  const suffix = Math.random().toString(36).slice(2, 9);
  const touch: BallTouch = {
    id: `touch-${now}-${suffix}`,
    setNumber,
    rallyNumber,
    sequenceNumber: 1,
    teamSide,
    playerId: player?.id,
    skill: parsed.skill ?? 'attack',
    evaluation: parsed.evaluation ?? '+',
    ...(parsed.skillType ? { skillTypeCode: parsed.skillType } : {}),
    ...(parsed.customCode ? { customCode: parsed.customCode } : {}),
    ...(parsed.startZone ? { startZoneCode: parsed.startZone } : {}),
    ...(parsed.endZone ? { endZoneCode: parsed.endZone } : {}),
    source: 'explicit',
    touchOrigin: 'live_scouting',
    createdAt: now,
    recordedAtIso,
    recordedAtTime,
  };

  return {
    id: `event-${now}-${suffix}`,
    type: 'touch_recorded',
    createdAt: now,
    touch,
    location: {
      teamSide,
    },
  };
}

export function insertCodeInEventLog(input: {
  eventLog: readonly MatchEvent[];
  targetEventIndex: number | null;
  parsed: ParsedTouchCode;
  homePlayers: readonly Player[];
  awayPlayers: readonly Player[];
  now?: number;
}): MatchEvent[] {
  const context = resolveCodeListInsertionContext(input.eventLog, input.targetEventIndex);
  const newEvent = buildInsertedTouchEvent({
    parsed: input.parsed,
    homePlayers: input.homePlayers,
    awayPlayers: input.awayPlayers,
    setNumber: context.setNumber,
    rallyNumber: context.rallyNumber,
    now: input.now,
  });
  const nextLog = [
    ...input.eventLog.slice(0, context.insertAt),
    newEvent,
    ...input.eventLog.slice(context.insertAt),
  ];
  return renumberRallySequences(nextLog);
}

export function deleteTouchFromEventLog(
  eventLog: readonly MatchEvent[],
  eventIndex: number,
): MatchEvent[] {
  if (eventIndex < 0 || eventIndex >= eventLog.length) return [...eventLog];
  if (eventLog[eventIndex].type !== 'touch_recorded') return [...eventLog];
  const nextLog = [
    ...eventLog.slice(0, eventIndex),
    ...eventLog.slice(eventIndex + 1),
  ];
  return renumberRallySequences(nextLog);
}

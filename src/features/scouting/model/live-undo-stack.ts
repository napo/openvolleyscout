import type { MatchEvent } from '@src/domain/events/types';
import type { LiveMatchState } from './index';
import { getLiveMatchReplayStatus } from './replay';
import { buildUndoLastPointEventLog, getUndoLastPointAvailability } from './score-corrections';
import type { ScoutingActionAvailability } from './corrections';
import {
  createUndoEntry,
  isValidUndoEntry,
  type LiveUndoEntry,
} from './live-undo-entry';

export type { LiveUndoEntry };
export { createUndoEntry };

export function getGroupedUndoAvailability(
  liveMatch: LiveMatchState | null,
  undoStack: readonly LiveUndoEntry[],
): ScoutingActionAvailability {
  if (!liveMatch) {
    return { canApply: false, reason: 'no_supported_action' };
  }

  const replayStatus = getLiveMatchReplayStatus(liveMatch.activeProjectId, liveMatch.eventLog);
  if (!replayStatus.canReplay) {
    return { canApply: false, reason: 'replay_unavailable' };
  }

  const lastEntry = undoStack.at(-1);
  if (lastEntry && isValidUndoEntry(lastEntry, liveMatch.eventLog.length)) {
    return { canApply: true };
  }

  // Fallback: no valid stack entry — check if undoLastPoint is available
  const fallback = getUndoLastPointAvailability(liveMatch);
  if (fallback.canApply) {
    return { canApply: true };
  }

  return { canApply: false, reason: 'no_supported_action' };
}

export type GroupedUndoResult = {
  nextEventLog: MatchEvent[];
  nextStack: LiveUndoEntry[];
  diagnostics: {
    source: 'stack' | 'fallback_last_point';
    removedEventCount: number;
    stackLabel?: string;
    wasStaleEntry: boolean;
  };
};

export function buildGroupedUndoResult(
  liveMatch: LiveMatchState,
  undoStack: readonly LiveUndoEntry[],
): GroupedUndoResult | null {
  const lastEntry = undoStack.at(-1);

  if (lastEntry && isValidUndoEntry(lastEntry, liveMatch.eventLog.length)) {
    return {
      nextEventLog: liveMatch.eventLog.slice(0, lastEntry.eventCountBefore),
      nextStack: undoStack.slice(0, -1),
      diagnostics: {
        source: 'stack',
        removedEventCount: liveMatch.eventLog.length - lastEntry.eventCountBefore,
        stackLabel: lastEntry.label,
        wasStaleEntry: false,
      },
    };
  }

  // Stale or empty stack: pop the stale entry and fall back to undoLastPoint
  const nextStack = lastEntry ? undoStack.slice(0, -1) : [...undoStack];
  const wasStaleEntry = Boolean(lastEntry);

  const fallbackLog = buildUndoLastPointEventLog(liveMatch);
  if (fallbackLog) {
    return {
      nextEventLog: fallbackLog,
      nextStack,
      diagnostics: {
        source: 'fallback_last_point',
        removedEventCount: liveMatch.eventLog.length - fallbackLog.length,
        stackLabel: lastEntry?.label,
        wasStaleEntry,
      },
    };
  }

  return null;
}

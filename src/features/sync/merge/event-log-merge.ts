import type { MatchEvent } from '@src/domain/events/types';
import { mergeIdKeyedArray, type IdKeyedArrayConflict } from './id-keyed-array-merge';

export interface OpenSetDivergenceConflict {
  kind: 'open_set_divergence';
  setNumber: number;
  localEvents: MatchEvent[];
  remoteEvents: MatchEvent[];
}

export interface EventLogMergeResult {
  /** `null` when unresolved open-set divergence blocks automatic merging. */
  merged: MatchEvent[] | null;
  divergenceConflicts: OpenSetDivergenceConflict[];
  /**
   * Only reachable in theory — event ids are never mutated in place anywhere
   * in this app (undo truncates the array tail instead), so "same id,
   * different content on both sides" shouldn't occur in practice.
   */
  fieldConflicts: Array<IdKeyedArrayConflict<MatchEvent>>;
}

function getEventId(event: MatchEvent): string {
  return event.id;
}

/**
 * Finds set numbers where BOTH sides recorded events (relative to `base`)
 * that neither side has — i.e. both devices independently continued the
 * same set after the last sync. Interleaving two divergent continuations of
 * the same set can't be done safely (rally order/state would be ambiguous),
 * so this is surfaced as a blocking conflict instead.
 */
export function detectOpenSetDivergence(
  base: MatchEvent[],
  local: MatchEvent[],
  remote: MatchEvent[],
): OpenSetDivergenceConflict[] {
  const baseIds = new Set(base.map(getEventId));

  /**
   * Groups new (not-in-base) events by their enclosing set, tracked by
   * walking the array and remembering the most recent `set_started` seen —
   * `rally_started`/`touch_recorded` don't carry `setNumber` themselves, so
   * grouping by each event's own field would silently miss them.
   */
  function groupNewEventsBySet(events: MatchEvent[]): Map<number, MatchEvent[]> {
    const bySet = new Map<number, MatchEvent[]>();
    let currentSetNumber: number | undefined;

    for (const event of events) {
      if (event.type === 'set_started') {
        currentSetNumber = event.setNumber;
      }
      if (baseIds.has(event.id) || currentSetNumber === undefined) {
        continue;
      }
      const list = bySet.get(currentSetNumber) ?? [];
      list.push(event);
      bySet.set(currentSetNumber, list);
    }
    return bySet;
  }

  const newLocalBySet = groupNewEventsBySet(local);
  const newRemoteBySet = groupNewEventsBySet(remote);

  const conflicts: OpenSetDivergenceConflict[] = [];
  for (const [setNumber, localEvents] of newLocalBySet) {
    const remoteEvents = newRemoteBySet.get(setNumber);
    if (remoteEvents && remoteEvents.length > 0) {
      conflicts.push({ kind: 'open_set_divergence', setNumber, localEvents, remoteEvents });
    }
  }

  return conflicts.sort((a, b) => a.setNumber - b.setNumber);
}

/**
 * Merges the event log. Ordering is reconstructed by `createdAt` alone
 * (rather than a `(setNumber, rallyNumber, ...)` domain key): every event
 * carries `createdAt` and, within a single device's own timeline, it's
 * already monotonic with array position — sorting by it reproduces each
 * side's own relative order and interleaves the two sides chronologically.
 * A domain-key sort was considered but rejected: `rally_started` events
 * carry neither `setNumber` nor `rallyNumber`, so a key built from those
 * fields can't place them correctly. The merged result is still validated
 * for replayability by the caller (`match-project-merge.ts`) as the final
 * safety net.
 */
export function mergeEventLog(
  base: MatchEvent[],
  local: MatchEvent[],
  remote: MatchEvent[],
  divergenceResolutions: Record<number, 'local' | 'remote'> = {},
): EventLogMergeResult {
  const divergenceConflicts = detectOpenSetDivergence(base, local, remote);
  const unresolved = divergenceConflicts.filter((conflict) => !divergenceResolutions[conflict.setNumber]);

  if (unresolved.length > 0) {
    return { merged: null, divergenceConflicts: unresolved, fieldConflicts: [] };
  }

  const droppedIds = new Set<string>();
  for (const conflict of divergenceConflicts) {
    const losingEvents =
      divergenceResolutions[conflict.setNumber] === 'local' ? conflict.remoteEvents : conflict.localEvents;
    for (const event of losingEvents) {
      droppedIds.add(event.id);
    }
  }

  const filteredLocal = local.filter((event) => !droppedIds.has(event.id));
  const filteredRemote = remote.filter((event) => !droppedIds.has(event.id));

  const { merged, conflicts } = mergeIdKeyedArray(base, filteredLocal, filteredRemote, getEventId);
  const sorted = [...merged].sort((a, b) => a.createdAt - b.createdAt);

  return { merged: sorted, divergenceConflicts: [], fieldConflicts: conflicts };
}

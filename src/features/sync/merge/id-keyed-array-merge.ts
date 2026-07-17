import { deepEqual } from './deep-equal';

export type IdKeyedConflictKind = 'edited_vs_deleted' | 'changed_differently';

export interface IdKeyedArrayConflict<T> {
  id: string;
  kind: IdKeyedConflictKind;
  base: T | undefined;
  local: T | undefined;
  remote: T | undefined;
}

export interface IdKeyedArrayMergeResult<T> {
  merged: T[];
  conflicts: Array<IdKeyedArrayConflict<T>>;
}

/**
 * Generic 3-way merge for an array where every item has a stable id. Reused
 * for `events`/`touches`, `homeSelection`/`awaySelection` rosters,
 * `videoAnalysis.syncPoints`, and the `linked*Ids` string arrays (with
 * `getId = (x) => x`).
 *
 * An id absent from both `local` and `remote` (deleted independently on both
 * sides) is simply dropped — no conflict, since both sides agree it's gone.
 * Everything else is one of two conflict kinds: an item edited on one side
 * while deleted on the other (`edited_vs_deleted`, defaults to keeping the
 * edit), or edited differently on both sides (`changed_differently`, defaults
 * to keeping `local`). Both defaults are only the pre-selected choice for the
 * conflict preview UI — the caller can override via its own resolution logic
 * before persisting.
 */
export function mergeIdKeyedArray<T>(
  base: T[],
  local: T[],
  remote: T[],
  getId: (item: T) => string,
): IdKeyedArrayMergeResult<T> {
  const baseById = new Map(base.map((item) => [getId(item), item] as const));
  const localById = new Map(local.map((item) => [getId(item), item] as const));
  const remoteById = new Map(remote.map((item) => [getId(item), item] as const));

  const orderedIds: string[] = [];
  const seenIds = new Set<string>();
  for (const item of [...local, ...remote]) {
    const id = getId(item);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      orderedIds.push(id);
    }
  }

  const merged: T[] = [];
  const conflicts: Array<IdKeyedArrayConflict<T>> = [];

  for (const id of orderedIds) {
    const baseItem = baseById.get(id);
    const localItem = localById.get(id);
    const remoteItem = remoteById.get(id);
    const hasBase = baseById.has(id);

    if (localItem !== undefined && remoteItem !== undefined) {
      if (deepEqual(localItem, remoteItem) || deepEqual(remoteItem, baseItem)) {
        merged.push(localItem);
      } else if (deepEqual(localItem, baseItem)) {
        merged.push(remoteItem);
      } else {
        conflicts.push({ id, kind: 'changed_differently', base: baseItem, local: localItem, remote: remoteItem });
        merged.push(localItem);
      }
      continue;
    }

    if (localItem !== undefined) {
      // remote no longer has it
      if (!hasBase) {
        merged.push(localItem); // local-only add
      } else if (!deepEqual(localItem, baseItem)) {
        // local changed it while remote deleted it -> conflict, default to keeping the edit
        conflicts.push({ id, kind: 'edited_vs_deleted', base: baseItem, local: localItem, remote: undefined });
        merged.push(localItem);
      }
      // else: local unchanged, remote deleted it -> honor the deletion (drop, don't push)
      continue;
    }

    if (remoteItem !== undefined) {
      // local no longer has it
      if (!hasBase) {
        merged.push(remoteItem); // remote-only add
      } else if (!deepEqual(remoteItem, baseItem)) {
        // remote changed it while local deleted it -> conflict, default to keeping the edit
        conflicts.push({ id, kind: 'edited_vs_deleted', base: baseItem, local: undefined, remote: remoteItem });
        merged.push(remoteItem);
      }
      // else: remote unchanged, local deleted it -> honor the deletion (drop, don't push)
    }
  }

  return { merged, conflicts };
}

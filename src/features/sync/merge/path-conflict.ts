/** A conflict reported at a dotted/colon path, e.g. `"metadata.venue"`, `"homeSelection.roster:<playerId>"`. */
export interface PathConflict {
  path: string;
  base: unknown;
  local: unknown;
  remote: unknown;
}

/** Converts `mergeIdKeyedArray`'s per-id conflicts into `path:<id>`-prefixed `PathConflict`s. */
export function recordIdKeyedConflicts<T>(
  path: string,
  idConflicts: Array<{ id: string; base: T | undefined; local: T | undefined; remote: T | undefined }>,
  conflicts: PathConflict[],
): void {
  for (const conflict of idConflicts) {
    conflicts.push({ path: `${path}:${conflict.id}`, base: conflict.base, local: conflict.local, remote: conflict.remote });
  }
}

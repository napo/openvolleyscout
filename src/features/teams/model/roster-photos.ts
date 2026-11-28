// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What to write to the stored athlete photos when a roster is saved, a team is
 * deleted or two teams are merged. Pure: the callers read and write the photos
 * (see `features/branding/athlete-photo-storage.ts`).
 */

/**
 * The photo changes of a roster save, by archived player id (a data URL to
 * save, null to remove): the photos chosen or removed in the editor for the
 * athletes still on the roster, and a removal for every athlete taken off it.
 */
export function rosterPhotoChanges(
  pending: ReadonlyMap<string, string | null>,
  savedPlayerIds: Iterable<string>,
  currentPlayerIds: Iterable<string>,
): Map<string, string | null> {
  const current = new Set(currentPlayerIds);
  const changes = new Map<string, string | null>();
  for (const [id, value] of pending) {
    if (id && current.has(id)) changes.set(id, value);
  }
  for (const id of savedPlayerIds) {
    if (id && !current.has(id)) changes.set(id, null);
  }
  return changes;
}

/**
 * The photos to remove after teams were deleted: those of their athletes that
 * are not on any roster left (an athlete still on a roster keeps the photo).
 */
export function orphanedPhotoIds(
  deletedPlayerIds: Iterable<string>,
  remainingPlayerIds: Iterable<string>,
): string[] {
  const remaining = new Set(remainingPlayerIds);
  return [...new Set(deletedPlayerIds)].filter((id) => id && !remaining.has(id));
}

/**
 * The photo changes of a team merge. An athlete of the discarded team that is
 * the same athlete as one of the kept team (`playerRemap`: discarded id to kept
 * id) gives her photo to the kept athlete when that one has none; the photo of
 * the discarded id is removed either way, since no roster or match refers to
 * it any more.
 */
export function mergedTeamPhotoChanges(
  playerRemap: ReadonlyMap<string, string>,
  photos: ReadonlyMap<string, string>,
): Map<string, string | null> {
  const changes = new Map<string, string | null>();
  for (const [fromId, toId] of playerRemap) {
    if (!fromId || !toId || fromId === toId) continue;
    const photo = photos.get(fromId);
    if (!photo) continue;
    if (!photos.has(toId) && !changes.has(toId)) changes.set(toId, photo);
    changes.set(fromId, null);
  }
  return changes;
}

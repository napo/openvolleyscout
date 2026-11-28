// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useMemo, useState } from 'react';
import { saveAthletePhotoChanges } from '@src/features/branding/athlete-photo-storage';
import { useAthletePhotos } from '@src/features/branding/use-athlete-photos';
import { prepareSquarePhotoDataUrl } from '@src/lib/images/square-photo-file';
import { rosterPhotoChanges } from '../model/roster-photos';

const NO_CHANGES: ReadonlyMap<string, string | null> = new Map();

/**
 * The athlete photos of the roster being edited. A photo chosen or removed is
 * kept aside until the team is saved (`commit`), like the other fields of the
 * roster; cancelling the edit drops it (`discard`).
 */
export function useRosterPhotos(playerIds: readonly string[]) {
  const stored = useAthletePhotos(playerIds);
  const [pending, setPending] = useState<ReadonlyMap<string, string | null>>(NO_CHANGES);
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const photoOf = useCallback(
    (playerId: string): string | null => (pending.has(playerId) ? pending.get(playerId) ?? null : stored.get(playerId) ?? null),
    [pending, stored],
  );

  const toggle = (set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> => {
    if (set.has(id) === on) return set;
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    return next;
  };

  const setPhoto = useCallback((playerId: string, value: string | null) => {
    setPending((current) => new Map(current).set(playerId, value));
  }, []);

  /** Reads an image file, crops it to the square photo and keeps it for the athlete. */
  const choose = useCallback(async (playerId: string, file: Blob) => {
    setBusy((current) => toggle(current, playerId, true));
    try {
      const photo = await prepareSquarePhotoDataUrl(file);
      setErrors((current) => toggle(current, playerId, !photo));
      if (photo) setPhoto(playerId, photo);
    } finally {
      setBusy((current) => toggle(current, playerId, false));
    }
  }, [setPhoto]);

  const remove = useCallback((playerId: string) => {
    setErrors((current) => toggle(current, playerId, false));
    setPhoto(playerId, null);
  }, [setPhoto]);

  const discard = useCallback(() => {
    setPending(NO_CHANGES);
    setErrors(new Set());
  }, []);

  /**
   * Writes the photos of the saved roster: those chosen or removed, and a
   * removal for every athlete taken off it. Keeps the changes when writing fails.
   */
  const commit = useCallback(async (savedPlayerIds: Iterable<string>, currentPlayerIds: Iterable<string>) => {
    const changes = rosterPhotoChanges(pending, savedPlayerIds, currentPlayerIds);
    if (changes.size > 0) await saveAthletePhotoChanges(changes);
    discard();
  }, [discard, pending]);

  const hasChanges = useMemo(
    () => [...pending].some(([id, value]) => (stored.get(id) ?? null) !== value),
    [pending, stored],
  );

  return {
    photoOf,
    hasError: (playerId: string) => errors.has(playerId),
    isBusy: (playerId: string) => busy.has(playerId),
    choose,
    remove,
    discard,
    commit,
    hasChanges,
  };
}

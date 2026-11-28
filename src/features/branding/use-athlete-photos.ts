// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import { subscribeDataChanges } from '@src/features/sync/cloud/local-change-bus';
import { loadAthletePhotos } from './athlete-photo-storage';

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * The stored photos of these archived athletes, by archived player id, read
 * again whenever the data changes (a photo saved here, or received by cloud
 * sync or a restored backup). Empty while loading.
 */
export function useAthletePhotos(archivedPlayerIds: readonly string[]): ReadonlyMap<string, string> {
  // A stable key, so a new array with the same ids does not read again.
  const key = useMemo(() => [...new Set(archivedPlayerIds.filter(Boolean))].sort().join('\n'), [archivedPlayerIds]);
  const [photos, setPhotos] = useState<ReadonlyMap<string, string>>(EMPTY);
  useEffect(() => {
    const ids = key ? key.split('\n') : [];
    if (ids.length === 0) {
      setPhotos(EMPTY);
      return undefined;
    }
    let active = true;
    let request = 0;
    const load = () => {
      request += 1;
      const current = request;
      loadAthletePhotos(ids)
        .then((loaded) => { if (active && current === request) setPhotos(loaded); })
        .catch((error) => console.warn('Could not read the athlete photos', error));
    };
    load();
    const stop = subscribeDataChanges(load);
    return () => {
      active = false;
      stop();
    };
  }, [key]);
  return photos;
}

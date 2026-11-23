// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Keeps the claim on the match being scouted for as long as it is open in
 * live scouting, wherever the scout is in the app (scouting screen, Settings,
 * analysis): it is claimed when the match is opened, sent when the app goes to
 * the background, and released when the match is closed or completed.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '@src/app/store/app-store';
import type { MatchProject } from '@src/domain/match/types';
import { cloudSyncController } from './archive-adapter';

const toIso = (ms: number | undefined) => new Date(typeof ms === 'number' && ms > 0 ? ms : Date.now()).toISOString();

/** The match counts as being scouted while it is in the scouting phase and not completed. */
export function isMatchBeingScouted(project: MatchProject | null): project is MatchProject {
  return Boolean(project)
    && project!.phase === 'scouting'
    && project!.scoutingSession?.matchStatus !== 'completed';
}

export function ScoutingClaimKeeper() {
  const project = useAppStore((state) => state.activeProject);
  const scouted = isMatchBeingScouted(project) ? project : null;
  const matchId = scouted?.metadata.id ?? null;
  const updatedAtRef = useRef(scouted?.updatedAt);
  updatedAtRef.current = scouted?.updatedAt;

  useEffect(() => {
    if (!matchId) return undefined;
    cloudSyncController.claimScouting(matchId, toIso(updatedAtRef.current));
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void cloudSyncController.pauseScouting();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void cloudSyncController.releaseScouting();
    };
  }, [matchId]);

  useEffect(() => {
    if (matchId && scouted?.updatedAt) cloudSyncController.touchScouting(toIso(scouted.updatedAt));
  }, [matchId, scouted?.updatedAt]);

  return null;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArchivedPlayer } from '@src/domain/team/types';
import type { OpponentReportTeamRef } from '@src/domain/opponent-report/types';
import { teamRepository } from '@src/infrastructure/repositories';
import { subscribeDataChanges } from '@src/features/sync/cloud/local-change-bus';
import { resolveAthletePhotoIds, type ReportPlayerIdentity } from '@src/features/branding/athlete-photos';
import { useAthletePhotos } from '@src/features/branding/use-athlete-photos';

const EMPTY: ReadonlyMap<string, string> = new Map();

/** The athletes of the team of the report as the roster has them now: by archived team, else by the team's name. */
function useReportRoster(team: OpponentReportTeamRef | undefined): ArchivedPlayer[] | null {
  const [roster, setRoster] = useState<ArchivedPlayer[] | null>(null);
  const teamId = team?.archivedTeamId ?? '';
  const teamName = team?.name ?? '';
  useEffect(() => {
    if (!teamId && !teamName) {
      setRoster(null);
      return undefined;
    }
    let active = true;
    const load = () => {
      void (teamId ? teamRepository.getById(teamId) : teamRepository.getByName(teamName))
        .then((record) => { if (active) setRoster(record?.roster.players ?? null); })
        .catch((error) => { console.warn('Could not read the roster of the report team', error); });
    };
    load();
    // A roster edited, received by cloud sync or restored from a backup.
    const stop = subscribeDataChanges(load);
    return () => {
      active = false;
      stop();
    };
  }, [teamId, teamName]);
  return roster;
}

const sameMap = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>) =>
  a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);

/**
 * The stored photos of the athletes of the report, by report player key, for the line-up of the Team page.
 * Players are matched to the roster of the report team (see resolveAthletePhotoIds); an athlete with no
 * photo is not in the map. The same map is returned while nothing changes, so plans built from it are kept.
 */
export function useReportAthletePhotos(players: readonly ReportPlayerIdentity[] | undefined, team: OpponentReportTeamRef | undefined): ReadonlyMap<string, string> {
  const roster = useReportRoster(team);
  const ids = useMemo(() => resolveAthletePhotoIds(players ?? [], roster), [players, roster]);
  const archivedIds = useMemo(() => [...new Set(ids.values())], [ids]);
  const byArchivedId = useAthletePhotos(archivedIds);
  const previous = useRef<ReadonlyMap<string, string>>(EMPTY);
  return useMemo(() => {
    const next = new Map<string, string>();
    for (const [key, archivedId] of ids) {
      const photo = byArchivedId.get(archivedId);
      if (photo) next.set(key, photo);
    }
    if (sameMap(next, previous.current)) return previous.current;
    previous.current = next.size ? next : EMPTY;
    return previous.current;
  }, [ids, byArchivedId]);
}

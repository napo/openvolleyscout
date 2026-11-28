// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Photos of the athletes, kept with the data of the app (backups and cloud
 * sync carry them as app assets, like the club logo). One photo per archived
 * athlete, under the id `image:athlete:<archived player id>`: a square PNG or
 * JPEG data URL of at most 256 px.
 *
 * This module only names, checks and finds the photos, so the report builders
 * and the tests can use it without the database. Reading and writing them is
 * in `athlete-photo-storage.ts`.
 *
 * Runs under ts-node too: relative and type-only imports only.
 */

import type { ArchivedPlayer } from '../../domain/team/types';
import { SQUARE_PHOTO_MAX_LENGTH } from '../../lib/images/square-photo-file';

export const ATHLETE_PHOTO_ASSET_PREFIX = 'image:athlete:';

/** Longest stored photo (a 256 px JPEG weighs far less). */
export const MAX_ATHLETE_PHOTO_LENGTH = SQUARE_PHOTO_MAX_LENGTH;

/** The app-asset id of the photo of an archived athlete. */
export function athletePhotoAssetId(archivedPlayerId: string): string {
  return `${ATHLETE_PHOTO_ASSET_PREFIX}${archivedPlayerId}`;
}

export function isAthletePhotoAssetId(id: string): boolean {
  return id.startsWith(ATHLETE_PHOTO_ASSET_PREFIX) && id.length > ATHLETE_PHOTO_ASSET_PREFIX.length;
}

/** The archived athlete of a photo id, or null when the id is not one of a photo. */
export function archivedPlayerIdFromPhotoAssetId(id: string): string | null {
  return isAthletePhotoAssetId(id) ? id.slice(ATHLETE_PHOTO_ASSET_PREFIX.length) : null;
}

/** A photo as stored: a PNG or JPEG data URL, small enough for every document. */
export function isAthletePhoto(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ATHLETE_PHOTO_LENGTH && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
}

const normalizeName = (value: string | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** An athlete as the tactical report knows them (`ReportPlayer` / `TeamPlayerInfo`). */
export interface ReportPlayerIdentity {
  /** The archived athlete id when the match was linked to the archive, else `#<jersey>|<last name>`. */
  key: string;
  jersey: string;
  name: string;
}

/**
 * Which archived athlete each report player is, by report key, among the
 * roster of the team of the report (the latest roster of
 * `report.opponent.archivedTeamId`):
 * 1. the roster athlete whose id is the key;
 * 2. otherwise the only roster athlete with that jersey and that name (full
 *    name, or the last name of the key); for a player with no name, the only
 *    roster athlete with that jersey;
 * 3. otherwise none (two candidates, or no roster): the silhouette is drawn.
 */
export function resolveAthletePhotoIds(
  players: readonly ReportPlayerIdentity[],
  roster: readonly Pick<ArchivedPlayer, 'id' | 'jerseyNumber' | 'firstName' | 'lastName'>[] | null | undefined,
): Map<string, string> {
  const result = new Map<string, string>();
  if (!roster?.length) return result;
  const ids = new Set(roster.map((athlete) => athlete.id));
  for (const player of players) {
    if (ids.has(player.key)) {
      result.set(player.key, player.key);
      continue;
    }
    const jersey = player.jersey.trim();
    if (!jersey) continue;
    const sameJersey = roster.filter((athlete) => String(athlete.jerseyNumber ?? '').trim() === jersey);
    const name = normalizeName(player.name);
    const named = name !== '' && name !== `#${jersey}`;
    const keySuffix = player.key.startsWith('#') ? normalizeName(player.key.slice(player.key.indexOf('|') + 1)) : '';
    const candidates = named
      ? sameJersey.filter((athlete) => {
        const full = normalizeName([athlete.firstName, athlete.lastName].filter(Boolean).join(' '));
        const last = normalizeName(athlete.lastName);
        return (full !== '' && full === name) || (last !== '' && (last === name || last === keySuffix));
      })
      : sameJersey;
    if (candidates.length === 1) result.set(player.key, candidates[0].id);
  }
  return result;
}

/**
 * The photo records of a backup restored into a team that was here already
 * under another id: an incoming athlete that is the same athlete as one here
 * (`playerRemap`: incoming id to the id kept here) gives her photo to the
 * athlete here, unless that athlete has a photo (`localPhotoPlayerIds`) or the
 * backup carries one for her. The photo under the incoming id is left out,
 * since no roster refers to that id any more. Other records pass unchanged.
 */
export function remapRestoredAthletePhotos<T extends { id: string }>(
  records: readonly T[],
  playerRemap: ReadonlyMap<string, string>,
  localPhotoPlayerIds: ReadonlySet<string>,
): T[] {
  if (playerRemap.size === 0) return [...records];
  const direct = new Set<string>();
  for (const record of records) {
    const playerId = archivedPlayerIdFromPhotoAssetId(record.id);
    if (playerId && !playerRemap.has(playerId)) direct.add(playerId);
  }
  const given = new Set<string>();
  const result: T[] = [];
  for (const record of records) {
    const playerId = archivedPlayerIdFromPhotoAssetId(record.id);
    const target = playerId ? playerRemap.get(playerId) : undefined;
    if (!target || target === playerId) {
      result.push(record);
      continue;
    }
    if (localPhotoPlayerIds.has(target) || direct.has(target) || given.has(target)) continue;
    given.add(target);
    result.push({ ...record, id: athletePhotoAssetId(target) });
  }
  return result;
}

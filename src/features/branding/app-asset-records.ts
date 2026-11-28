// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * App assets (the print look and the images of the app) as they travel in
 * backups and cloud files: checked when read, and turned into the values the
 * printed documents use.
 */

import type { AppAssetRecord } from '@src/infrastructure/db/match-project-db';
import {
  CLUB_LOGO_ASSET_ID,
  PRINT_THEME_ASSET_ID,
  isPrintLogo,
  parsePrintThemeChoice,
  type PrintBranding,
} from '@src/lib/theme/print-theme';
import { isAthletePhoto, isAthletePhotoAssetId } from './athlete-photos';

/**
 * A record from a backup or a cloud file, or null when it is not one. Only its
 * shape is checked here: the value is kept exactly as it is, so a print look or
 * an image saved by a later version (a new theme, a new field, another image
 * format) is not dropped or cut down when this version rewrites the cloud
 * file. Values are checked where they are used (`printBrandingFromRecords`,
 * `isUsableAppAsset`).
 */
export function readAppAssetRecord(raw: unknown): AppAssetRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, kind, value, updatedAt } = raw as Partial<AppAssetRecord>;
  if (typeof id !== 'string' || !id || typeof kind !== 'string' || !kind) return null;
  if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) return null;
  return { id, kind, value, updatedAt };
}

/**
 * Whether this version can use the record, so a backup may put it in place of
 * the value here: a valid print look, a valid club logo, a valid athlete
 * photo, or a kind this version does not know (kept as it is for the versions
 * that do).
 */
export function isUsableAppAsset(record: AppAssetRecord): boolean {
  if (record.id === PRINT_THEME_ASSET_ID) return record.kind === 'printTheme' && parsePrintThemeChoice(record.value) !== null;
  if (record.id === CLUB_LOGO_ASSET_ID) return record.kind === 'image' && isPrintLogo(record.value);
  if (isAthletePhotoAssetId(record.id)) return record.kind === 'image' && isAthletePhoto(record.value);
  return true;
}

export function readAppAssetRecords(raw: unknown): AppAssetRecord[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, AppAssetRecord>();
  for (const item of raw) {
    const record = readAppAssetRecord(item);
    if (record) byId.set(record.id, record);
  }
  return [...byId.values()];
}

/** The print look and logo held by these records. */
export function printBrandingFromRecords(records: readonly AppAssetRecord[]): PrintBranding {
  const theme = records.find((record) => record.id === PRINT_THEME_ASSET_ID);
  const logo = records.find((record) => record.id === CLUB_LOGO_ASSET_ID);
  return {
    themeChoice: theme ? parsePrintThemeChoice(theme.value) : null,
    logo: logo && isPrintLogo(logo.value) ? logo.value : null,
  };
}

// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Keeps the print look and the club logo in the database. The print-theme
 * module answers synchronously from memory (the PDF builders need it); this
 * bridge fills that memory from the database and writes every change made in
 * Settings back to it, so the values are saved, backed up and synced.
 */

import { notifyLocalDataChanged } from '@src/features/sync/cloud/local-change-bus';
import { LEGACY_APP_ASSET_TIME } from '@src/infrastructure/db/match-project-db';
import {
  adoptLegacyAppAsset,
  deleteAppAsset,
  loadAppAssets,
  putAppAsset,
} from '@src/infrastructure/storage/app-asset-storage';
import {
  CLUB_LOGO_ASSET_ID,
  PRINT_THEME_ASSET_ID,
  hydratePrintBranding,
  readPrintLogo,
  readStoredPrintThemeChoice,
  setPrintBrandingPersister,
  type PrintBrandingChange,
  type PrintThemeChoice,
} from '@src/lib/theme/print-theme';
import { printBrandingFromRecords } from './app-asset-records';

/** Changes made in Settings since start-up: a load that started before one is read again. */
let localChanges = 0;
let pending: Promise<void> = Promise.resolve();

async function persist(change: PrintBrandingChange): Promise<void> {
  const changed = change.value === null
    ? await deleteAppAsset(change.id)
    : await putAppAsset(change.id === PRINT_THEME_ASSET_ID
      ? { id: change.id, kind: 'printTheme', value: change.value }
      : { id: change.id, kind: 'image', value: change.value });
  if (changed) notifyLocalDataChanged();
}

function onChange(change: PrintBrandingChange): void {
  localChanges += 1;
  // One write after the other, so the last change made is the one kept.
  pending = pending
    .then(() => persist(change))
    .catch((error) => console.warn('Could not save the print look or the club logo', error));
}

/** Reads the values from the database into memory (after cloud sync or a restored backup). */
export async function refreshPrintBrandingFromDatabase(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = localChanges;
    await pending;
    const records = await loadAppAssets();
    if (before === localChanges) {
      hydratePrintBranding(printBrandingFromRecords(records));
      return;
    }
  }
}

/**
 * Copies into the database a value this browser still has only in localStorage
 * (saved before the database kept it, and never deleted since). It runs in the
 * same queue as the changes made in Settings, and only writes when the
 * database holds nothing for that value, so a change made meanwhile is never
 * overwritten. Returns whether it wrote.
 */
async function adoptLocalValues(theme: PrintThemeChoice | null, logo: string | null): Promise<boolean> {
  let adopted = false;
  if (theme) {
    adopted = (await adoptLegacyAppAsset({ id: PRINT_THEME_ASSET_ID, kind: 'printTheme', value: theme }, LEGACY_APP_ASSET_TIME)) || adopted;
  }
  if (logo) {
    adopted = (await adoptLegacyAppAsset({ id: CLUB_LOGO_ASSET_ID, kind: 'image', value: logo }, LEGACY_APP_ASSET_TIME)) || adopted;
  }
  return adopted;
}

/**
 * At start-up: writes every later change to the database and loads what it
 * holds, after copying there what this browser kept only in localStorage.
 */
export async function hydratePrintBrandingFromDatabase(): Promise<void> {
  // Read before any change is queued: a change made from now on is written
  // after the copy, as a newer value, and so is never dated as an old one.
  const theme = readStoredPrintThemeChoice();
  const logo = readPrintLogo();
  setPrintBrandingPersister(onChange);
  let adopted = false;
  pending = pending
    .then(async () => { adopted = await adoptLocalValues(theme, logo); })
    .catch((error) => console.warn('Could not copy the print look or the club logo into the database', error));
  await refreshPrintBrandingFromDatabase();
  if (adopted) notifyLocalDataChanged();
}

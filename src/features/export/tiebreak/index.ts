/**
 * Tiebreak Tech export — public API.
 *
 *   const result = await exportMatchToTiebreak(project);
 *   await saveFile(result.fileName, result.bytes);
 */
import type { MatchProject } from '@src/domain/match/types';
import { exportMatchToDataVolley } from '@src/features/export/datavolley';
import { parseDataVolleyFile } from '@src/features/import/parser/datavolley-parser';
import { loadSqlJs } from '@src/features/import/parser/tiebreak-parser';
import { saveFile } from '@src/lib/utils/save-file';
import templateSql from './tiebreak-template.sql?raw';
import { writeTiebreakDatabase, type SqlJsWritableStatic, type TiebreakWriteDiagnostic } from './tiebreak-writer';

export { writeTiebreakDatabase } from './tiebreak-writer';
export type { TiebreakWriteDiagnostic } from './tiebreak-writer';

export interface TiebreakExportResult {
  bytes: Uint8Array;
  fileName: string;
  diagnostics: TiebreakWriteDiagnostic[];
}

/**
 * Export an OVS match to a Tiebreak Tech match database (.db).
 *
 * Goes through the DataVolley export, which already works out rotations,
 * setter positions and the score of every rally, and writes its parsed form
 * as Tiebreak Tech tables.
 */
export async function exportMatchToTiebreak(project: MatchProject): Promise<TiebreakExportResult> {
  const dataVolley = exportMatchToDataVolley(project);
  const parsed = parseDataVolleyFile(dataVolley.text, { sourceName: dataVolley.fileName });
  const SQL = await loadSqlJs() as unknown as SqlJsWritableStatic;
  const { bytes, diagnostics } = writeTiebreakDatabase(SQL, templateSql, parsed);
  return {
    bytes,
    fileName: dataVolley.fileName.replace(/\.dvw$/i, '.db'),
    diagnostics,
  };
}

export async function downloadTiebreakFile(result: TiebreakExportResult): Promise<void> {
  await saveFile(result.fileName, result.bytes, 'application/x-sqlite3');
}

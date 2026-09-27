/**
 * DataVolley Export — public API.
 *
 * Usage:
 *   import { exportMatchToDataVolley } from '@src/features/export/datavolley';
 *
 *   const result = exportMatchToDataVolley(project);
 *   downloadDataVolleyFile(result.fileName, result.text);
 */

import type { MatchProject } from '@src/domain/match/types';
import { extractOvsMatchForDataVolley } from './model/ovs-match-extractor';
import { serializeDataVolleyModel } from './serializer/datavolley-serializer';
import { getDataVolleyExportFileName } from './utils/datavolley-file-utils';
import type { DataVolleyExportResult, DataVolleyScoutRow } from './types';

export { downloadDataVolleyFile, getDataVolleyExportFileName } from './utils/datavolley-file-utils';
export type {
  DataVolleyExportDiagnostic,
  DataVolleyExportDiagnosticSeverity,
  DataVolleyExportModel,
  DataVolleyExportResult,
  DataVolleyScoutRow,
} from './types';

/**
 * Export an OVS match project to a DataVolley `.dvw` file.
 *
 * Returns the export model, the serialized `.dvw` text, a suggested file
 * name, and structured diagnostics for any actions that could not be
 * represented exactly in the DataVolley format.
 */
export interface DataVolleyExportOptions {
  /**
   * Where the first serve happens in the match video, in seconds. Row video
   * times are measured from the start of scouting, so they are shifted to
   * line up with the video (e.g. a YouTube recording used by SyncScout).
   */
  firstServeVideoSeconds?: number;
}

function isServeRow(row: DataVolleyScoutRow): boolean {
  // Player rows look like "*07SH+..." / "a12SM#...": team, two-digit jersey, skill.
  return /^[*a]\d{2}S/.test(row.code);
}

/** Shifts every row's video time so that the first serve lands at `firstServeVideoSeconds`. */
export function alignVideoTimesToFirstServe(rows: DataVolleyScoutRow[], firstServeVideoSeconds: number): DataVolleyScoutRow[] {
  const firstServe = rows.find((row) => isServeRow(row) && row.videoTime !== undefined);
  if (!firstServe || firstServe.videoTime === undefined) {
    return rows;
  }
  const offset = firstServeVideoSeconds - firstServe.videoTime;
  return rows.map((row) => (
    row.videoTime === undefined ? row : { ...row, videoTime: Math.max(0, row.videoTime + offset) }
  ));
}

export function exportMatchToDataVolley(project: MatchProject, options: DataVolleyExportOptions = {}): DataVolleyExportResult {
  const extracted = extractOvsMatchForDataVolley(project);
  const { diagnostics } = extracted;
  const model = options.firstServeVideoSeconds === undefined
    ? extracted.model
    : { ...extracted.model, scoutRows: alignVideoTimesToFirstServe(extracted.model.scoutRows, options.firstServeVideoSeconds) };
  const text = serializeDataVolleyModel(model);
  const fileName = getDataVolleyExportFileName(project);

  return {
    model,
    text,
    fileName,
    diagnostics,
  };
}

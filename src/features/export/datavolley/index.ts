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
import type { DataVolleyExportResult } from './types';

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
export function exportMatchToDataVolley(project: MatchProject): DataVolleyExportResult {
  const { model, diagnostics } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);
  const fileName = getDataVolleyExportFileName(project);

  return {
    model,
    text,
    fileName,
    diagnostics,
  };
}

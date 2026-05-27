import type { DataVolleyExportDiagnostic } from './types';

export const DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES = {
  missingTimestamp: 'missing_timestamp',
  unsupportedEvent: 'unsupported_event_type',
  missingPlayerJersey: 'missing_player_jersey',
  missingLineup: 'missing_lineup',
  unsupportedLiberoEvent: 'unsupported_libero_event',
  unsupportedDirection: 'unsupported_direction_format',
  regeneratedImportedCode: 'regenerated_imported_code',
  missingEvaluation: 'missing_evaluation',
  roundTripMismatch: 'round_trip_mismatch',
} as const;

export function createDataVolleyExportDiagnostic(
  diagnostic: DataVolleyExportDiagnostic,
): DataVolleyExportDiagnostic {
  return diagnostic;
}

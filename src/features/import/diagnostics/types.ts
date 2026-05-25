export type ParsedImportSeverity = 'info' | 'warning' | 'error';

export interface ParsedImportWarning {
  line?: number;
  code?: string;
  message: string;
  severity: ParsedImportSeverity;
}

export function createImportWarning(warning: ParsedImportWarning): ParsedImportWarning {
  return warning;
}

export function countImportDiagnostics(
  warnings: readonly ParsedImportWarning[],
): Record<ParsedImportSeverity, number> {
  return warnings.reduce<Record<ParsedImportSeverity, number>>(
    (totals, warning) => {
      totals[warning.severity] += 1;
      return totals;
    },
    {
      info: 0,
      warning: 0,
      error: 0,
    },
  );
}

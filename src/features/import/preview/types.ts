import type { ParsedImportWarning } from '../diagnostics';

export interface DataVolleyImportPreviewSet {
  setNumber: number;
  score?: {
    home: number;
    away: number;
  };
  played: boolean;
  duration?: number;
}

export interface DataVolleyImportPreview {
  homeTeamName: string;
  awayTeamName: string;
  score: {
    homeSets: number;
    awaySets: number;
  };
  sets: DataVolleyImportPreviewSet[];
  playerCounts: {
    home: number;
    away: number;
  };
  parsedActionsCount: number;
  parsedRowsCount: number;
  warningsCount: number;
  errorsCount: number;
  warnings: ParsedImportWarning[];
}

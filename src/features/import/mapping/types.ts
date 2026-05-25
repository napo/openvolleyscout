import type { MatchProject } from '@src/domain/match/types';
import type { ParsedImportWarning } from '../diagnostics';

export interface DataVolleyImportMappingOptions {
  createdAt?: number;
  importId?: string;
  sourceName?: string;
  includeSubstitutions?: boolean;
}

export interface MappedDataVolleyImport {
  project: MatchProject;
  warnings: ParsedImportWarning[];
}

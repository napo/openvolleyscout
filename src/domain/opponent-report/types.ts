/**
 * Opponent scouting report: several matches of ONE opposing team, gathered
 * to prepare the match against it, printed as a multi-sheet PDF.
 */

/** A team referenced by the report: the archived team when linked, else its name. */
export interface OpponentReportTeamRef {
  archivedTeamId?: string;
  name: string;
}

/** Sheets of the report, in their default order. */
export const OPPONENT_REPORT_SHEET_IDS = [
  'keys',
  'overview',
  'reception',
  'attackers',
  'setter',
  'serve',
  'board',
] as const;

export type OpponentReportSheetId = (typeof OPPONENT_REPORT_SHEET_IDS)[number];

export interface OpponentReportSheetState {
  id: OpponentReportSheetId;
  enabled: boolean;
}

/** A free drawing sheet (court, players, arrows); the editor fills `shapes` later. */
export interface OpponentReportDrawing {
  id: string;
  title: string;
  note: string;
  court: 'half' | 'full';
  orientation: 'horizontal' | 'vertical';
  shapes: unknown[];
}

export interface OpponentReport {
  id: string;
  title: string;
  opponent: OpponentReportTeamRef;
  /** The team that will face the opponent: drives the "similar to us" index. */
  ownTeam?: OpponentReportTeamRef;
  /** Match ids included in the analysis, chosen by the user. */
  matchIds: string[];
  /** General notes. */
  notes: string;
  /** Free notes keyed by subject (e.g. `player:<id>`), filled in later phases. */
  freeTexts: Record<string, string>;
  drawings: OpponentReportDrawing[];
  /** Sheets in print order, each on or off. */
  sheets: OpponentReportSheetState[];
  createdAt: number;
  updatedAt: number;
}

/** The quick report: keys, overview, reception and board; the rest on demand. */
const DEFAULT_ENABLED_SHEETS: ReadonlySet<OpponentReportSheetId> = new Set(['keys', 'overview', 'reception', 'board']);

export function createDefaultOpponentReportSheets(): OpponentReportSheetState[] {
  return OPPONENT_REPORT_SHEET_IDS.map((id) => ({ id, enabled: DEFAULT_ENABLED_SHEETS.has(id) }));
}

export function createOpponentReport(input: {
  id: string;
  title: string;
  opponent: OpponentReportTeamRef;
  ownTeam?: OpponentReportTeamRef;
  matchIds?: string[];
  now?: number;
}): OpponentReport {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    title: input.title,
    opponent: input.opponent,
    ...(input.ownTeam ? { ownTeam: input.ownTeam } : {}),
    matchIds: input.matchIds ?? [],
    notes: '',
    freeTexts: {},
    drawings: [],
    sheets: createDefaultOpponentReportSheets(),
    createdAt: now,
    updatedAt: now,
  };
}

/** A copy with a new id and title, as a fresh report. */
export function duplicateOpponentReport(report: OpponentReport, id: string, title: string, now = Date.now()): OpponentReport {
  return {
    ...structuredClone(report),
    id,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

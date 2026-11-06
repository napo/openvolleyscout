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
  'serveTargets',
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

export type OpponentReportDrawingTeam = 'opponent' | 'own';

export interface OpponentReportPlayerShape {
  id: string;
  kind: 'player';
  team: OpponentReportDrawingTeam;
  number: string;
  label?: string;
  /** Court percentage coordinate (0..100). */
  x: number;
  /** Court percentage coordinate (0..100). */
  y: number;
  /** Optional custom styling when extracted from an analysis court diagram. */
  fillColor?: string;
  strokeColor?: string;
  textColor?: string;
  radius?: number;
}

export interface OpponentReportArrowShape {
  id: string;
  kind: 'arrow';
  team: OpponentReportDrawingTeam;
  /** Start and end coordinates in court percentage (0..100). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Optional quadratic Bezier control point in court percentage (0..100). */
  cx?: number;
  cy?: number;
  /** Optional custom styling when extracted from an analysis court diagram. */
  color?: string;
  strokeWidth?: number;
}

export interface OpponentReportConeShape {
  id: string;
  kind: 'cone';
  team: OpponentReportDrawingTeam;
  /** Apex (attack origin) and base corners in court percentage (0..100). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  color?: string;
  opacity?: number;
}

export interface OpponentReportTextShape {
  id: string;
  kind: 'text';
  text: string;
  /** Court percentage coordinate (0..100). */
  x: number;
  /** Court percentage coordinate (0..100). */
  y: number;
  color?: string;
  fontSize?: number;
  anchor?: 'start' | 'middle' | 'end';
}

export interface OpponentReportAreaShape {
  id: string;
  kind: 'area';
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export type OpponentReportShape =
  | OpponentReportAreaShape
  | OpponentReportPlayerShape
  | OpponentReportArrowShape
  | OpponentReportConeShape
  | OpponentReportTextShape;

/** A free or extracted court drawing sheet (court backdrop, players, arrows, cones, text). */
export interface OpponentReportDrawing {
  id: string;
  title: string;
  note: string;
  court: 'half' | 'full';
  orientation: 'horizontal' | 'vertical';
  shapes: OpponentReportShape[];
  /** Optional SVG backdrop and viewBox dimensions when editing an analysis court diagram. */
  backgroundSvg?: string;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

/** User customizations applied to a chosen analysis piece on the board / PDF composer. */
export interface OpponentReportPieceEdit {
  title?: string;
  subtitle?: string;
  itemsTitle?: string;
  items?: string[];
  secondaryItemsTitle?: string;
  secondaryItems?: string[];
  table?: {
    columns?: string[];
    rows?: string[][];
  };
  courtSamples?: Record<string, string>;
  courtBadges?: Record<string, string>;
  courtDrawings?: Record<string, OpponentReportDrawing>;
  note?: string;
}

/** A key confirmed (possibly edited) from a suggestion, or written by hand. */
export interface OpponentReportKey {
  /** The suggestion id for confirmed ones; a fresh id for custom ones. */
  id: string;
  text: string;
  source: 'auto' | 'custom';
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
  /** Free notes keyed by subject (e.g. `attacker:<player key>`), filled in later phases. */
  freeTexts: Record<string, string>;
  drawings: OpponentReportDrawing[];
  /** Ordered list of analysis/extra piece ids selected for the board and PDF. */
  boardPieceIds?: string[];
  /** Per-piece text, table, and court-drawing overrides edited on the board. */
  pieceEdits?: Record<string, OpponentReportPieceEdit>;
  /** Duplicated analysis pieces: instance id -> original catalog id. */
  pieceCopies?: Record<string, string>;
  /** Absent on legacy reports, which retain their original selection. */
  draftCreatedAt?: number;
  draftStatus?: 'preparing' | 'editing';
  sourceScopeKey?: string;
  /** "The 5 keys" kept by the user, in print order. Absent in reports saved before keys existed. */
  keys?: OpponentReportKey[];
  /** Suggestions the user removed: not proposed again. */
  dismissedKeyIds?: string[];
  /** Sheets in print order, each on or off. */
  sheets: OpponentReportSheetState[];
  createdAt: number;
  updatedAt: number;
}

/** The default ("quick") report includes Keys, Overview, Reception, Serve Targets, and Board. */
export const DEFAULT_ENABLED_SHEETS: ReadonlySet<OpponentReportSheetId> = new Set([
  'keys',
  'overview',
  'reception',
  'serveTargets',
  'board',
]);

export function createDefaultOpponentReportSheets(): OpponentReportSheetState[] {
  return OPPONENT_REPORT_SHEET_IDS.map((id) => ({ id, enabled: DEFAULT_ENABLED_SHEETS.has(id) }));
}

const KNOWN_SHEET_IDS: ReadonlySet<OpponentReportSheetId> = new Set(OPPONENT_REPORT_SHEET_IDS);

/** Preserves the saved sheet order and enabled flags while ensuring every known sheet is present once. */
export function normalizeOpponentReportSheets(
  sheets: readonly OpponentReportSheetState[] | undefined,
): OpponentReportSheetState[] {
  if (!sheets || sheets.length === 0) return createDefaultOpponentReportSheets();
  const seen = new Set<OpponentReportSheetId>();
  const result: OpponentReportSheetState[] = [];
  for (const entry of sheets) {
    if (!KNOWN_SHEET_IDS.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push({ id: entry.id, enabled: Boolean(entry.enabled) });
  }
  for (const id of OPPONENT_REPORT_SHEET_IDS) {
    if (!seen.has(id)) {
      result.push({ id, enabled: DEFAULT_ENABLED_SHEETS.has(id) });
    }
  }
  return result;
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
    draftStatus: 'preparing',
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

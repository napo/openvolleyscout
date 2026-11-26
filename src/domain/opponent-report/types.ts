/**
 * Opponent scouting report: several matches of ONE opposing team, gathered
 * to prepare the match against it, printed as a multi-sheet PDF.
 */
import type { AttackSubtype } from '../touch/types';

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
  'zones',
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
  legendLabel?: string;
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
  /** 'move' renders a light dashed arrow with a small head for post-first-touch movement. */
  variant?: 'arrow' | 'move';
  legendLabel?: string;
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
  legendLabel?: string;
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
  fontWeight?: 'normal' | 'bold';
  anchor?: 'start' | 'middle' | 'end';
  isPlayerName?: boolean;
  legendLabel?: string;
}

export interface OpponentReportAreaShape {
  id: string;
  kind: 'area';
  color?: string;
  opacity?: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  legendLabel?: string;
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
  /** Optional non-editable legend footer preserved outside rotated courts. */
  legendFooter?: string;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

/** User customizations applied to a chosen analysis piece on the board / PDF composer. */
export interface ServeHeatmapCellEdit {
  visible: boolean;
  percent?: number | null;
}

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
  /** Quarter turns of a court diagram, labels kept upright. */
  courtRotations?: Record<string, 90 | 180 | 270>;
  serveHeatmapEdits?: Record<string, ServeHeatmapCellEdit>;
  note?: string;
}

/** A key confirmed (possibly edited) from a suggestion, or written by hand. */
export interface OpponentReportKey {
  /** The suggestion id for confirmed ones; a fresh id for custom ones. */
  id: string;
  text: string;
  source: 'auto' | 'custom';
  /** Language-independent automatic wording; text is the coach's override/fallback. */
  suggestion?: { kind: string; params: Record<string, string | number>; sample: number };
  includeInPrint?: boolean;
}

export interface OpponentReportBooklet {
  format: 'compact' | 'extended' | 'custom';
  base: 'compact' | 'extended';
  includeServe: boolean;
  /** Add a sheet with the servers beyond the six main ones (otherwise listed as text). */
  includeServeReserves?: boolean;
  /** "Block and defence" attack-direction sheet; included unless false. */
  includeAttackers?: boolean;
  includeSecondSetter: boolean;
  /** "Zone analysis" pages (after reception, in transition); off unless true. */
  includeZones?: boolean;
  /** Coach-selected attackers retained in text without direction drawings. */
  textOnlyAttackerKeys?: string[];
  includeBoardExtras: boolean;
}

export type OpponentReportComponentId = OpponentReportSheetId | 'notes';

/** Custom setter distribution view filter (serve type, serve start zone, reception band). */
export type SetterDistributionServeType = 'jump_spin' | 'jump_float' | 'float' | 'other';
export type SetterDistributionReceptionBand = 'all' | 'positive' | 'negative';
export type SetterDistributionReceptionEval = '#' | '+' | '!' | '-';

export interface SetterDistributionViewConfig {
  id: string;
  label: string;
  receptionBand: SetterDistributionReceptionBand;
  /** Optional fine-grained reception evaluation filter; when non-empty, overrides receptionBand. */
  receptionEvaluations?: SetterDistributionReceptionEval[];
  /** Empty or omitted = all serve types. */
  serveTypes?: SetterDistributionServeType[];
  /** Empty or omitted = all serve start zones ('1', '9', '6', '7', '5': DataVolley manual 13.2). */
  serveStartZones?: string[];
  /** Empty or omitted = all reception zones (e.g. '1', '5', '6'). */
  receptionZones?: string[];
  /** Empty or omitted = all receivers (ReportPlayer.key). */
  receiverKeys?: string[];
  /** Draw one card per value of this filter ("draw separately"); omitted = one card ("draw together"). */
  splitBy?: 'serveStartZones' | 'receptionZones' | 'serveTypes';
}

/** Custom attacker direction view filter (phase, reception, rotation, zone, subtype, base/combination, blockers, evaluation). */
export type AttackerDirectionPhase = 'after_receive' | 'after_dig' | 'high_ball' | 'late_set';
export type AttackerDirectionEvaluation = '#' | '+' | '!' | '-' | '/' | '=';

export interface AttackerDirectionViewConfig {
  id: string;
  label: string;
  /** Empty or omitted = all phases. */
  phases?: AttackerDirectionPhase[];
  /** Empty or omitted = all reception evaluations (only matches attacks preceded by reception). */
  receptionEvaluations?: SetterDistributionReceptionEval[];
  /** Empty or omitted = all rotations (1..6). */
  rotations?: number[];
  /** Empty or omitted = all attack start zones ('4', '3', '2', '6', '1', '5'). */
  attackZones?: string[];
  /** Empty or omitted = all attack evaluations ('#', '+', '!', '-', '/', '='). */
  evaluations?: AttackerDirectionEvaluation[];
  /** Empty or omitted = all blocker counts (0 to 3, and 4 = open block). */
  blockers?: number[];
  /** Empty or omitted = all attack subtypes ('H' hard, 'P' placed, 'T' tip). */
  attackSubtypes?: AttackSubtype[];
  /** Empty or omitted = all attack combination / base codes (e.g. 'X5', 'V5', 'XP', 'K1'). */
  combinationCodes?: string[];
  /** Draw one card per value of this filter ("draw separately"); omitted = one card ("draw together"). */
  splitBy?: 'attackZones' | 'rotations' | 'phases';
}

export interface OpponentReport {
  /** One-time recovery of sheets omitted by archived DVW setter references. */
  setterDistributionRecovered?: boolean;
  id: string;
  title: string;
  opponent: OpponentReportTeamRef;
  /** The team that will face the opponent: drives the "similar to us" index. */
  ownTeam?: OpponentReportTeamRef;
  /** Match ids included in the analysis, chosen by the user. */
  matchIds: string[];
  /** General notes. */
  notes: string;
  /** Show receiver names under the dots in "Where to serve" (default: true). */
  showServeTargetNames?: boolean;
  /** Coach overrides for automatically collected staff notes; empty text excludes a note. */
  staffNoteEdits?: Record<string, string>;
  /** Free notes keyed by subject (e.g. `attacker:<player key>`), filled in later phases. */
  freeTexts: Record<string, string>;
  drawings: OpponentReportDrawing[];
  /** Ordered list of analysis/extra piece ids selected for the board and PDF. */
  boardPieceIds?: string[];
  /** Component order shared by the editor navigator and all export layouts. */
  componentOrder?: OpponentReportComponentId[];
  /** Per-piece text, table, and court-drawing overrides edited on the board. */
  pieceEdits?: Record<string, OpponentReportPieceEdit>;
  /** Duplicated analysis pieces: instance id -> original catalog id. */
  pieceCopies?: Record<string, string>;
  /** Custom setter distribution views configured by the coach; absent = default positive/negative bands. */
  setterViews?: SetterDistributionViewConfig[];
  /** Attack cones: directions under this share (%) are not drawn; absent or 0 = all directions. */
  attackDirectionMinPercent?: number;
  /** Custom attacker direction views configured by the coach; absent = single default view (all attacks). */
  attackerViews?: AttackerDirectionViewConfig[];
  /** Absent on legacy reports, which retain their original selection. */
  draftCreatedAt?: number;
  draftStatus?: 'preparing' | 'editing';
  sourceScopeKey?: string;
  /** "The 5 keys" kept by the user, in print order. Absent in reports saved before keys existed. */
  keys?: OpponentReportKey[];
  /** Absent on legacy reports; the original A4 export remains available. */
  booklet?: OpponentReportBooklet;
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
    booklet: { format: 'extended', base: 'extended', includeServe: true, includeServeReserves: false, includeAttackers: true, includeSecondSetter: false, includeBoardExtras: false },
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

/**
 * A report opened from "Create tactical report" and left before any choice:
 * still preparing, with no opponent, matches, drawings or created draft.
 */
export function isAbandonedOpponentReportDraft(report: OpponentReport): boolean {
  return report.draftStatus === 'preparing'
    && !report.opponent.name
    && report.matchIds.length === 0
    && report.drawings.length === 0
    && !report.boardPieceIds
    && !report.draftCreatedAt;
}

/**
 * Pure model for the interactive Board / PDF Composer:
 * selects analysis pieces ("pezzi") across sheets, applies user text/table/SVG
 * overrides, manages ordering and extra free-drawing sheets, and produces the
 * resolved sequence rendered both on the Board tab and in the exported A4 PDF.
 */
import {
  normalizeOpponentReportSheets,
  type OpponentReport,
  type OpponentReportDrawing,
  type OpponentReportPieceEdit,
  type OpponentReportSheetId,
} from '@src/domain/opponent-report/types';
import type { AttackerVideoLink } from './attacker-video-links';
import { buildReceptionFormationSvg } from './reception-formation';
import { playerLabel } from './report-keys';
import {
  SETTER_ROTATION_ORDER,
  attackerNotesKey,
  
  SERVE_NOTES_KEY,
  SERVE_TARGETS_NOTES_KEY,
  SETTER_NOTES_KEY,
  type ReportView,
  type ViewCell,
  type ViewT,
  type ViewTable } from './report-view';
import { buildTacticalBoardSvg, extractEditableDrawingFromSvg } from './tactical-board';

export const PIECE_KEYS_MAIN = 'keys:main';
export const PIECE_OVERVIEW_ROTATIONS = 'overview:rotations';
export const PIECE_OVERVIEW_STRENGTHS = 'overview:strengths-weaknesses';
export const PIECE_OVERVIEW_ERRORS = 'overview:errors';
export const PIECE_OVERVIEW_BREAK_REACTION = 'overview:break-reaction';
export const PIECE_RECEPTION_SUMMARY = 'reception:summary';
export const PIECE_RECEPTION_FORMATIONS = 'reception:formations';
export const PIECE_RECEPTION_RECEIVERS = 'reception:receivers';
export const PIECE_RECEPTION_FIRST_BALL = 'reception:first-ball';
export const PIECE_RECEPTION_POSITIVE = 'reception:positive-reception';
export const PIECE_RECEPTION_SERVE_TARGETS = 'reception:serve-targets';

export const setterPieceId = (playerKey: string, bandKey: 'positive' | 'negative') =>
  `setter:${playerKey}:${bandKey}`;
export const attackerPieceId = (playerKey: string) => `attacker:${playerKey}`;
export const servePieceId = (playerKey: string) => `serve:${playerKey}`;
export const extraPieceId = (drawingId: string) => `extra:${drawingId}`;

export interface ResolvedBoardCourt {
  key: string;
  label: string;
  /** Original generated SVG before user edits. */
  rawSvg: string;
  /** Final SVG to display/print (edited drawing SVG if customized, else `rawSvg`). */
  svg: string;
  /** Present when the user has customized this court diagram on the board. */
  drawing?: OpponentReportDrawing;
  sample?: string;
  badge?: ViewCell;
}

export interface ResolvedBoardPiece {
  id: string;
  sheetId: OpponentReportSheetId;
  kind:
    | 'ordered-list'
    | 'table'
    | 'dual-bullets'
    | 'court-grid'
    | 'court-with-bullets'
    | 'player-card'
    | 'extra-sheet';
  title: string;
  subtitle?: string;
  itemsTitle?: string;
  items?: string[];
  secondaryItemsTitle?: string;
  secondaryItems?: string[];
  tableTitle?: string;
  table?: ViewTable;
  court?: ResolvedBoardCourt;
  courts?: ResolvedBoardCourt[];
  videoLink?: AttackerVideoLink;
  drawingId?: string;
  drawing?: OpponentReportDrawing;
  note: string;
  isModified: boolean;
}

function applyTableEdit(base: ViewTable, edit?: OpponentReportPieceEdit['table']): ViewTable {
  if (!edit) return base;
  const columns = base.columns.map((col, colIndex) => edit.columns?.[colIndex] ?? col);
  const rows = base.rows.map((row, rowIndex) =>
    row.map((cell, cellIndex) => {
      const overrideText = edit.rows?.[rowIndex]?.[cellIndex];
      return overrideText !== undefined ? { ...cell, text: overrideText } : cell;
    }),
  );
  return { columns, rows };
}

function resolveCourt(
  _pieceId: string,
  courtKey: string,
  label: string,
  rawSvg: string,
  edit: OpponentReportPieceEdit | undefined,
  netLabel: string,
  defaultSample?: string,
  defaultBadge?: ViewCell,
): ResolvedBoardCourt {
  const customDrawing = edit?.courtDrawings?.[courtKey];
  const svg = customDrawing ? buildTacticalBoardSvg(customDrawing, { netLabel }) : rawSvg;
  const sample = edit?.courtSamples?.[courtKey] ?? defaultSample;
  const badgeOverride = edit?.courtBadges?.[courtKey];
  const badge = defaultBadge
    ? { ...defaultBadge, text: badgeOverride !== undefined ? badgeOverride : defaultBadge.text }
    : undefined;
  return {
    key: courtKey,
    label,
    rawSvg,
    svg,
    ...(customDrawing ? { drawing: customDrawing } : {}),
    ...(sample !== undefined ? { sample } : {}),
    ...(badge ? { badge } : {}),
  };
}

function hasPieceEdit(edit: OpponentReportPieceEdit | undefined): boolean {
  if (!edit) return false;
  return (
    edit.title !== undefined
    || edit.subtitle !== undefined
    || edit.itemsTitle !== undefined
    || edit.items !== undefined
    || edit.secondaryItemsTitle !== undefined
    || edit.secondaryItems !== undefined
    || edit.table !== undefined
    || (edit.courtSamples !== undefined && Object.keys(edit.courtSamples).length > 0)
    || (edit.courtBadges !== undefined && Object.keys(edit.courtBadges).length > 0)
    || (edit.courtDrawings !== undefined && Object.keys(edit.courtDrawings).length > 0)
    || edit.note !== undefined
  );
}

/**
 * Builds the complete catalog of pieces from the current report and calculated view.
 */
export function buildBoardPieceCatalog(
  report: OpponentReport,
  view: ReportView,
  t: ViewT,
): Map<string, ResolvedBoardPiece> {
  const catalog = new Map<string, ResolvedBoardPiece>();
  const edits = report.pieceEdits ?? {};
  const netLabel = t('opponentReportNet');

  // ── 1. Keys ────────────────────────────────────────────────────────────────
  {
    const id = PIECE_KEYS_MAIN;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'keys',
      kind: 'ordered-list',
      title: edit?.title ?? t('opponentReportSheet_keys'),
      items: edit?.items ?? (report.booklet || report.keys ? view.keys.filter((entry, index) => index < 5 && (index < 3 || entry.includeInPrint !== false)) : view.keys).map((entry) => entry.text),
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }

  // ── 2. Overview ────────────────────────────────────────────────────────────
  {
    const id = PIECE_OVERVIEW_ROTATIONS;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'overview',
      kind: 'table',
      title: edit?.title ?? t('opponentReportRotations'),
      table: applyTableEdit(view.overview.rotations, edit?.table),
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }
  {
    const id = PIECE_OVERVIEW_STRENGTHS;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'overview',
      kind: 'dual-bullets',
      title: edit?.title ?? `${t('opponentReportStrengths')} / ${t('opponentReportWeaknesses')}`,
      itemsTitle: edit?.itemsTitle ?? t('opponentReportStrengths'),
      items: edit?.items ?? view.overview.strengths,
      secondaryItemsTitle: edit?.secondaryItemsTitle ?? t('opponentReportWeaknesses'),
      secondaryItems: edit?.secondaryItems ?? view.overview.weaknesses,
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }
  {
    const id = PIECE_OVERVIEW_ERRORS;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'overview',
      kind: 'table',
      title: edit?.title ?? t('opponentReportErrors'),
      table: applyTableEdit(view.overview.errors, edit?.table),
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }
  {
    const id = PIECE_OVERVIEW_BREAK_REACTION;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'overview',
      kind: 'table',
      title: edit?.title ?? t('opponentReportBreakReaction'),
      subtitle: edit?.subtitle ?? t('opponentReportBreakReactionHelp'),
      table: applyTableEdit(view.overview.breakReaction, edit?.table),
      note: edit?.note ?? view.overview.notes,
      isModified: hasPieceEdit(edit),
    });
  }

  // ── 3. Reception ───────────────────────────────────────────────────────────
  {
    const id = PIECE_RECEPTION_SUMMARY;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'reception',
      kind: 'dual-bullets',
      title: edit?.title ?? t('opponentReportSheet_reception'),
      subtitle: edit?.subtitle ?? view.reception.summary,
      itemsTitle: edit?.itemsTitle ?? t('opponentReportDoesWell'),
      items: edit?.items ?? view.reception.good,
      secondaryItemsTitle: edit?.secondaryItemsTitle ?? t('opponentReportDoesBadly'),
      secondaryItems: edit?.secondaryItems ?? view.reception.bad,
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }
  {
    const id = PIECE_RECEPTION_FORMATIONS;
    const edit = edits[id];
    const courts = view.reception.formations.map(({ title, formation }) => {
      const courtKey = `P${formation.rotation}`;
      const rawSvg = buildReceptionFormationSvg(formation, { title, net: netLabel });
      return resolveCourt(id, courtKey, title, rawSvg, edit, netLabel);
    });
    catalog.set(id, {
      id,
      sheetId: 'reception',
      kind: 'court-grid',
      title: edit?.title ?? t('opponentReportFormations'),
      subtitle: edit?.subtitle ?? view.reception.formationSystem,
      courts,
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }
  {
    const id = PIECE_RECEPTION_RECEIVERS;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'reception',
      kind: 'table',
      title: edit?.title ?? t('opponentReportReceivers'),
      table: applyTableEdit(view.reception.receivers, edit?.table),
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }
  {
    const id = PIECE_RECEPTION_FIRST_BALL;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'reception',
      kind: 'table',
      title: edit?.title ?? t('opponentReportFirstBall'),
      table: applyTableEdit(view.reception.firstBall, edit?.table),
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }
  {
    const id = PIECE_RECEPTION_POSITIVE;
    const edit = edits[id];
    catalog.set(id, {
      id,
      sheetId: 'reception',
      kind: 'table',
      title: edit?.title ?? t('opponentReportPositiveReception'),
      subtitle: edit?.subtitle ?? t('opponentReportPositiveReceptionHelp'),
      table: applyTableEdit(view.reception.positiveReception, edit?.table),
      note: edit?.note ?? '',
      isModified: hasPieceEdit(edit),
    });
  }
  {
    const id = PIECE_RECEPTION_SERVE_TARGETS;
    const edit = edits[id];
    const recommendations = new Map(view.serveTargets.recommendations.map((entry) => [entry.rotation, entry.text]));
    const courts = [...view.serveTargets.formations].sort((a, b) => SETTER_ROTATION_ORDER.findIndex(rotation => rotation === a.formation.rotation) - SETTER_ROTATION_ORDER.findIndex(rotation => rotation === b.formation.rotation)).map(({ title, formation }) => {
      const courtKey = `P${formation.rotation}`;
      return resolveCourt(
        id,
        courtKey,
        courtKey,
        buildReceptionFormationSvg(formation, { title, net: netLabel }),
        edit,
        netLabel,
        recommendations.get(formation.rotation) ?? t('opponentReportServeTargetNone'),
      );
    });
    catalog.set(id, {
      id,
      sheetId: 'serveTargets',
      kind: 'court-grid',
      title: edit?.title ?? t('opponentReportServeTargets'),
      subtitle: edit?.subtitle ?? t('opponentReportServeTargetsHelp'),
      courts,
      note: edit?.note ?? report.freeTexts[SERVE_TARGETS_NOTES_KEY] ?? '',
      isModified: hasPieceEdit(edit),
    });
  }

  // ── 4. Setter ──────────────────────────────────────────────────────────────
  for (const group of view.setter.groups) {
    const setterLabel = playerLabel(group.player);
    for (const band of group.bands) {
      const id = setterPieceId(group.player.key, band.key);
      const edit = edits[id];
      const athletesLine = band.players.length > 0
        ? `${t('opponentReportSetterPlayersInBand')}: ${band.players
          .map((player) => playerLabel(player))
          .join(' · ')}`
        : '';
      const courts = [...band.courts].sort((a, b) => SETTER_ROTATION_ORDER.findIndex(rotation => rotation === a.rotation) - SETTER_ROTATION_ORDER.findIndex(rotation => rotation === b.rotation)).map((court) => {
        const courtKey = `P${court.rotation}`;
        return resolveCourt(
          id,
          courtKey,
          courtKey,
          court.svg,
          edit,
          netLabel,
          court.sample,
          court.predictability,
        );
      });
      catalog.set(id, {
        id,
        sheetId: 'setter',
        kind: 'court-grid',
        title: edit?.title ?? `${setterLabel} – ${band.title}`,
        subtitle: edit?.subtitle ?? [view.advice?.[`setter:${group.player.key}`], athletesLine].filter(Boolean).join(' · '),
        courts,
        videoLink: band.videoLink,
        note: edit?.note ?? report.freeTexts[SETTER_NOTES_KEY] ?? '',
        isModified: hasPieceEdit(edit),
      });
    }
  }

  // ── 5. Attackers ───────────────────────────────────────────────────────────
  for (const attacker of view.attackers) {
    const id = attackerPieceId(attacker.player.key);
    const edit = edits[id];
    const label = playerLabel(attacker.player);
    catalog.set(id, {
      id,
      sheetId: 'attackers',
      kind: 'player-card',
      title: edit?.title ?? label,
      subtitle: edit?.subtitle ?? view.advice?.[`attack:${attacker.player.key}`],
      court: resolveCourt(id, 'main', label, attacker.courtSvg, edit, netLabel, attacker.courtSample),
      tableTitle: edit?.itemsTitle ?? t('opponentReportAttackPerformance'),
      table: applyTableEdit(attacker.highlights, edit?.table),
      videoLink: attacker.videoLink,
      note: edit?.note ?? report.freeTexts[attackerNotesKey(attacker.player.key)] ?? attacker.notes,
      isModified: hasPieceEdit(edit),
    });
  }

  // ── 6. Serve ───────────────────────────────────────────────────────────────
  for (const server of view.serve.servers) {
    const id = servePieceId(server.player.key);
    const edit = edits[id];
    const label = playerLabel(server.player);
    catalog.set(id, {
      id,
      sheetId: 'serve',
      kind: 'player-card',
      title: edit?.title ?? label,
      subtitle: edit?.subtitle ?? view.advice?.[`serve:${server.player.key}`],
      court: resolveCourt(id, 'main', label, server.courtSvg, edit, netLabel, server.courtSample),
      tableTitle: edit?.itemsTitle ?? t('opponentReportSheet_serve'),
      table: applyTableEdit(server.highlights, edit?.table),
      videoLink: server.videoLink,
      note: edit?.note ?? report.freeTexts[SERVE_NOTES_KEY] ?? '',
      isModified: hasPieceEdit(edit),
    });
  }

  // ── 7. Extra free drawing sheets ───────────────────────────────────────────
  (report.drawings ?? []).forEach((drawing, index) => {
    const id = extraPieceId(drawing.id);
    const title = drawing.title || t('opponentReportBoardDefaultTitle', { number: index + 1 });
    catalog.set(id, {
      id,
      sheetId: 'board',
      kind: 'extra-sheet',
      title,
      drawingId: drawing.id,
      drawing,
      court: {
        key: 'main',
        label: title,
        rawSvg: buildTacticalBoardSvg(drawing, { netLabel }),
        svg: buildTacticalBoardSvg(drawing, { netLabel }),
        drawing,
      },
      note: drawing.note,
      isModified: false,
    });
  });

  // Individual reception cards reuse the same metrics and video playlist builder.
  for (const receiver of view.reception.individual ?? []) {
    const id = `receiver:${receiver.player.key}`;
    const edit = edits[id];
    catalog.set(id, {
      id, sheetId: 'reception', kind: 'player-card',
      title: edit?.title ?? playerLabel(receiver.player),
      subtitle: edit?.subtitle ?? view.advice?.[`receive:${receiver.player.key}`],
      table: applyTableEdit(receiver.table, edit?.table),
      tableTitle: edit?.itemsTitle ?? t('opponentReportSheet_reception'),
      videoLink: receiver.videoLink,
      note: edit?.note ?? '', isModified: hasPieceEdit(edit),
    });
  }
  for (const [id, sourceId] of Object.entries(report.pieceCopies ?? {})) {
    const source = catalog.get(sourceId);
    if (!source) continue;
    const edit = edits[id];
    const copyCourt = (court: ResolvedBoardCourt) => resolveCourt(id, court.key, court.label, court.rawSvg, edit, netLabel, court.sample, court.badge);
    catalog.set(id, {
      ...source, id,
      title: edit?.title ?? source.title,
      subtitle: edit?.subtitle ?? source.subtitle,
      itemsTitle: edit?.itemsTitle ?? source.itemsTitle,
      items: edit?.items ?? source.items,
      secondaryItemsTitle: edit?.secondaryItemsTitle ?? source.secondaryItemsTitle,
      secondaryItems: edit?.secondaryItems ?? source.secondaryItems,
      table: source.table ? applyTableEdit(source.table, edit?.table) : undefined,
      court: source.court ? copyCourt(source.court) : undefined,
      courts: source.courts?.map(copyCourt),
      note: edit?.note ?? source.note,
      isModified: hasPieceEdit(edit),
    });
  }
  return catalog;
}

export function getPieceIdsForSheet(
  sheetId: OpponentReportSheetId,
  report: OpponentReport,
  view: ReportView,
): string[] {
  switch (sheetId) {
    case 'keys':
      return [PIECE_KEYS_MAIN];
    case 'overview':
      return [
        PIECE_OVERVIEW_ROTATIONS,
        PIECE_OVERVIEW_STRENGTHS,
        PIECE_OVERVIEW_ERRORS,
        PIECE_OVERVIEW_BREAK_REACTION,
      ];
    case 'reception':
      return [
        PIECE_RECEPTION_SUMMARY,
        PIECE_RECEPTION_FORMATIONS,
        PIECE_RECEPTION_RECEIVERS,
        PIECE_RECEPTION_FIRST_BALL,
        PIECE_RECEPTION_POSITIVE,
      ];
    case 'serveTargets':
      return [PIECE_RECEPTION_SERVE_TARGETS];
    case 'setter':
      return view.setter.groups.flatMap((group) =>
        group.bands.map((band) => setterPieceId(group.player.key, band.key)),
      );
    case 'attackers':
      return view.attackers.map((attacker) => attackerPieceId(attacker.player.key));
    case 'serve':
      return view.serve.servers.map((server) => servePieceId(server.player.key));
    case 'board':
      return (report.drawings ?? []).map((drawing) => extraPieceId(drawing.id));
  }
}

export function resolveDefaultBoardPieceIds(
  report: OpponentReport,
  view: ReportView,
): string[] {
  const sheets = normalizeOpponentReportSheets(report.sheets);
  const result: string[] = [];
  for (const sheet of sheets) {
    if (!sheet.enabled && sheet.id !== 'board') continue;
    for (const id of getPieceIdsForSheet(sheet.id, report, view)) {
      if (!result.includes(id)) result.push(id);
    }
  }
  return result;
}

export function resolveActiveBoardPieceIds(
  report: OpponentReport,
  view: ReportView,
): string[] {
  const base = report.boardPieceIds
    ? [...report.boardPieceIds]
    : resolveDefaultBoardPieceIds(report, view);
  // Ensure every extra drawing in report.drawings is represented
  for (const drawing of report.drawings ?? []) {
    const id = extraPieceId(drawing.id);
    if (!base.includes(id)) {
      base.push(id);
    }
  }
  // The booklet's "How they serve" option drives the serve cards too (when directions exist).
  if (report.booklet?.includeServe !== false) {
    for (const server of view.serve.servers) {
      const id = servePieceId(server.player.key);
      if (server.hasDirections && !base.includes(id)) base.push(id);
    }
  }
  return base;
}

export function isPieceOnBoard(
  report: OpponentReport,
  view: ReportView,
  pieceId: string,
): boolean {
  return resolveActiveBoardPieceIds(report, view).includes(pieceId);
}

export function toggleBoardPiece(
  report: OpponentReport,
  view: ReportView,
  pieceId: string,
): OpponentReport {
  const current = resolveActiveBoardPieceIds(report, view);
  const exists = current.includes(pieceId);
  const next = exists
    ? current.filter((entry) => entry !== pieceId)
    : [...current, pieceId];
  return {
    ...report,
    boardPieceIds: next,
  };
}

export function moveBoardPiece(
  report: OpponentReport,
  view: ReportView,
  pieceId: string,
  delta: number,
): OpponentReport {
  const current = resolveActiveBoardPieceIds(report, view);
  const index = current.indexOf(pieceId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= current.length) return report;
  const next = [...current];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return {
    ...report,
    boardPieceIds: next,
  };
}

export function updateBoardPieceEdit(
  report: OpponentReport,
  pieceId: string,
  updater: (edit: OpponentReportPieceEdit) => OpponentReportPieceEdit,
): OpponentReport {
  const currentEdit = report.pieceEdits?.[pieceId] ?? {};
  const nextEdit = updater(currentEdit);
  return {
    ...report,
    pieceEdits: {
      ...(report.pieceEdits ?? {}),
      [pieceId]: nextEdit,
    },
  };
}

export function resetBoardPieceEdit(
  report: OpponentReport,
  pieceId: string,
): OpponentReport {
  if (!report.pieceEdits || !(pieceId in report.pieceEdits)) return report;
  const nextEdits = { ...report.pieceEdits };
  delete nextEdits[pieceId];
  return {
    ...report,
    pieceEdits: nextEdits,
  };
}

export function openPieceCourtForEditing(
  piece: ResolvedBoardPiece,
  courtKey: string,
): OpponentReportDrawing | null {
  const targetCourt = piece.court?.key === courtKey
    ? piece.court
    : piece.courts?.find((entry) => entry.key === courtKey);
  if (!targetCourt) return null;
  if (targetCourt.drawing) return targetCourt.drawing;
  return extractEditableDrawingFromSvg(
    targetCourt.rawSvg,
    `${piece.id}-${courtKey}`,
    targetCourt.label,
  );
}

export function resolveBoardPieces(
  report: OpponentReport,
  view: ReportView,
  t: ViewT,
): ResolvedBoardPiece[] {
  const catalog = buildBoardPieceCatalog(report, view, t);
  const activeIds = resolveActiveBoardPieceIds(report, view);
  return activeIds
    .map((id) => catalog.get(id))
    .filter((entry): entry is ResolvedBoardPiece => entry !== undefined);
}

/** Duplicate an analysis instance, preserving its current manual edits independently. */
export function duplicateBoardPiece(report: OpponentReport, view: ReportView, pieceId: string, newId: string, t: ViewT = (key) => key): OpponentReport {
  const ids = resolveActiveBoardPieceIds(report, view);
  const index = ids.indexOf(pieceId);
  if (index < 0 || ids.includes(newId) || pieceId.startsWith('extra:')) return report;
  const piece = buildBoardPieceCatalog(report, view, t).get(pieceId);
  if (!piece) return report;
  const courts = piece.courts ?? (piece.court ? [piece.court] : []);
  const snapshot: OpponentReportPieceEdit = {
    title: piece.title, subtitle: piece.subtitle ?? '',
    itemsTitle: piece.tableTitle ?? piece.itemsTitle ?? '', items: [...(piece.items ?? [])],
    secondaryItemsTitle: piece.secondaryItemsTitle ?? '', secondaryItems: [...(piece.secondaryItems ?? [])],
    note: piece.note,
    ...(piece.table ? { table: { columns: [...piece.table.columns], rows: piece.table.rows.map((row) => row.map((cell) => cell.text)) } } : {}),
    courtSamples: Object.fromEntries(courts.filter((court) => court.sample !== undefined).map((court) => [court.key, court.sample!])),
    courtBadges: Object.fromEntries(courts.filter((court) => court.badge).map((court) => [court.key, court.badge!.text])),
    courtDrawings: Object.fromEntries(courts.filter((court) => court.drawing).map((court) => [court.key, structuredClone(court.drawing!)])),
  };
  ids.splice(index + 1, 0, newId);
  return {
    ...report,
    boardPieceIds: ids,
    pieceCopies: { ...report.pieceCopies, [newId]: report.pieceCopies?.[pieceId] ?? pieceId },
    pieceEdits: { ...report.pieceEdits, [newId]: snapshot },
  };
}

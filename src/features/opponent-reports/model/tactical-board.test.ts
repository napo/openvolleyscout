import { describe, expect, it } from 'vitest';
import { createOpponentReport } from '@src/domain/opponent-report/types';
import {
  moveBoardPiece,
  duplicateBoardPiece,
  openPieceCourtForEditing,
  PIECE_KEYS_MAIN,
  PIECE_OVERVIEW_ROTATIONS,
  resetBoardPieceEdit,
  resolveBoardPieces,
  toggleBoardPiece,
  updateBoardPieceEdit,
} from './board-pieces';
import { createTacticalReportDraft } from './report-draft';
import { buildAttackerCourtSvg, type ReportView } from './report-view';
import {
  duplicateDrawingShape,
  drawingTextContrast,
  curveDrawingArrow,
  drawingArrowBend,
  addDrawingShape,
  addTacticalDrawing,
  buildTacticalBoardSvg,
  createDrawingHistory,
  createTacticalDrawing,
  deserializeTacticalDrawings,
  duplicateTacticalDrawing,
  extractEditableDrawingFromSvg,
  moveDrawingShape,
  moveTacticalDrawing,
  pushDrawingHistory,
  redoDrawingHistory,
  removeDrawingShape,
  removeTacticalDrawing,
  resetArrowCurve,
  serializeTacticalDrawings,
  undoDrawingHistory,
  updateArrowHandle,
  updateConeHandle,
  updateDrawingShape,
} from './tactical-board';

describe('tactical-board model', () => {
  it('manages multiple drawing sheets (add, duplicate, move, remove)', () => {
    const first = createTacticalDrawing({
      id: 'd1',
      title: 'P1 defence',
      note: 'Block line',
      court: 'half',
      orientation: 'vertical',
    });
    const second = createTacticalDrawing({
      id: 'd2',
      title: 'Full court serve receive',
      note: 'Shift left',
      court: 'full',
      orientation: 'horizontal',
    });

    let list = addTacticalDrawing([], first);
    list = addTacticalDrawing(list, second);
    expect(list.map((d) => d.id)).toEqual(['d1', 'd2']);

    list = duplicateTacticalDrawing(list, 'd1', 'd1-copy', 'P1 defence (copy)');
    expect(list.map((d) => d.id)).toEqual(['d1', 'd1-copy', 'd2']);

    list = moveTacticalDrawing(list, 2, -2);
    expect(list.map((d) => d.id)).toEqual(['d2', 'd1', 'd1-copy']);

    list = removeTacticalDrawing(list, 'd1-copy');
    expect(list.map((d) => d.id)).toEqual(['d2', 'd1']);
  });

  it('adds, moves, curves, edits, and removes shapes with clamped coordinates', () => {
    let sheet = createTacticalDrawing({ id: 'd1', title: 'Rotation P4' });
    sheet = addDrawingShape(sheet, {
      id: 'p1',
      kind: 'player',
      team: 'opponent',
      number: '7',
      label: 'Piani',
      x: 20,
      y: 30,
    });
    sheet = addDrawingShape(sheet, {
      id: 'a1',
      kind: 'arrow',
      team: 'opponent',
      x1: 20,
      y1: 30,
      x2: 80,
      y2: 70,
    });
    sheet = addDrawingShape(sheet, {
      id: 't1',
      kind: 'text',
      text: 'Cover tip',
      x: 50,
      y: 45,
    });

    // Move player to new coordinates (with clamping > 100)
    sheet = moveDrawingShape(sheet, 'p1', { x: 108, y: 62.5 });
    expect(sheet.shapes[0]).toMatchObject({ id: 'p1', x: 100, y: 62.5 });

    // Move arrow midpoint from (50, 50) to (40, 60) -> shifts by (-10, +10)
    sheet = moveDrawingShape(sheet, 'a1', { x: 40, y: 60 });
    expect(sheet.shapes[1]).toMatchObject({
      id: 'a1',
      x1: 10,
      y1: 40,
      x2: 70,
      y2: 80,
    });

    // Curve arrow with control handle, then reset curve
    sheet = updateArrowHandle(sheet, 'a1', 'control', 55, 35);
    expect(sheet.shapes[1]).toMatchObject({ cx: 55, cy: 35 });

    sheet = resetArrowCurve(sheet, 'a1');
    expect(sheet.shapes[1]).not.toHaveProperty('cx');

    // Edit text content
    sheet = updateDrawingShape(sheet, 't1', (shape) => (
      shape.kind === 'text' ? { ...shape, text: 'Watch pipe' } : shape
    ));
    expect(sheet.shapes[2]).toMatchObject({ text: 'Watch pipe' });

    // Remove shape
    sheet = removeDrawingShape(sheet, 'p1');
    expect(sheet.shapes.map((s) => s.id)).toEqual(['a1', 't1']);
  });

  it('tracks undo and redo history across shape edits', () => {
    let history = createDrawingHistory([]);
    const step1 = [{ id: 'p1', kind: 'player' as const, team: 'opponent' as const, number: '9', x: 25, y: 25 }];
    const step2 = [{ id: 'p1', kind: 'player' as const, team: 'opponent' as const, number: '9', x: 65, y: 75 }];

    history = pushDrawingHistory(history, step1);
    history = pushDrawingHistory(history, step2);
    expect(history.present[0]).toMatchObject({ x: 65, y: 75 });

    history = undoDrawingHistory(history);
    expect(history.present[0]).toMatchObject({ x: 25, y: 25 });

    history = undoDrawingHistory(history);
    expect(history.present).toHaveLength(0);

    history = redoDrawingHistory(history);
    expect(history.present[0]).toMatchObject({ x: 25, y: 25 });

    history = redoDrawingHistory(history);
    expect(history.present[0]).toMatchObject({ x: 65, y: 75 });
  });

  it('serializes and deserializes drawings to JSON and renders SVG for half and full courts', () => {
    const sheet = createTacticalDrawing({
      id: 'd1',
      title: 'Attack scheme',
      note: 'Setter in P1',
      court: 'full',
      orientation: 'horizontal',
      shapes: [
        { id: 'p1', kind: 'player', team: 'opponent', number: '12', x: 25, y: 30 },
        { id: 'p2', kind: 'player', team: 'own', number: '4', x: 75, y: 60 },
        { id: 'a1', kind: 'arrow', team: 'opponent', x1: 25, y1: 30, x2: 75, y2: 60, cx: 50, cy: 15 },
        { id: 't1', kind: 'text', text: 'Diagonal', x: 50, y: 45 },
      ],
    });

    const json = serializeTacticalDrawings([sheet]);
    const restored = deserializeTacticalDrawings(json);
    expect(restored).toEqual([sheet]);

    const svg = buildTacticalBoardSvg(restored[0], { netLabel: 'Net' });
    expect(svg).toContain('width="540" height="300"');
    expect(svg).toContain('data-court-line="net"');
    expect(svg).toContain('data-court-line="3m-left"');
    expect(svg).toContain('data-court-line="3m-right"');
    expect(svg).toContain('data-shape-id="p1"');
    expect(svg).toContain('data-shape-id="a1"');
    expect(svg).toContain('Q ');
    expect(svg).toContain('Diagonal');
  });

  it('extracts editable vector shapes (cones, arrows, players, texts) from generated court SVGs', () => {
    const attackerSvg = buildAttackerCourtSvg([
      {
        touchId: 'a1',
        teamSide: 'home',
        skill: 'attack',
        evaluation: '#',
        setNumber: 1,
        rallyNumber: 1,
        start: { x: 40.88, y: 25.68 },
        end: { x: 80, y: 74.32 },
        isInferred: false,
      },
    ], 'Attacker directions', {
      fans: 'Attack share',
      arrow: 'Scoring arrow',
      scoring: '{{points}} pts · {{share}}%',
    });

    let extracted = extractEditableDrawingFromSvg(attackerSvg, 'att-1', 'Attacker #12');
    expect(extracted.viewBoxWidth).toBe(270);
    expect(extracted.viewBoxHeight).toBe(340);
    expect(extracted.backgroundSvg).toContain('<rect');
    const cone = extracted.shapes.find((s) => s.kind === 'cone');
    const arrow = extracted.shapes.find((s) => s.kind === 'arrow');
    const text = extracted.shapes.find((s) => s.kind === 'text' && s.text.includes('100%'));
    expect(cone).toBeDefined();
    expect(arrow).toBeDefined();
    expect(text).toBeDefined();

    // Reshape cone apex handle and re-render to SVG
    extracted = updateConeHandle(extracted, cone!.id, 'apex', 50, 15);
    const rendered = buildTacticalBoardSvg(extracted);
    expect(rendered).toContain('data-shape-kind="cone"');
    expect(rendered).toContain('data-shape-kind="arrow"');
    expect(rendered).toContain('100%');
  });

  it('selects, reorders, edits, and resets analysis pieces on the board composer', () => {
    let report = createOpponentReport({
      id: 'r1',
      title: 'Test Report',
      opponent: { name: 'Offanengo' },
    });
    const dummyTable = {
      columns: ['Rot', 'SO%'],
      rows: [[{ text: 'P1' }, { text: '62%' }]],
    };
    const view: ReportView = {
      keys: [{ text: 'Serve on #7 in P1', source: 'suggested' }],
      overview: {
        rotations: dummyTable,
        strengths: ['Strong block'],
        weaknesses: ['Weak P4'],
        errors: dummyTable,
        teamIndicators: dummyTable,
        breakReaction: dummyTable,
        notes: 'Overview note',
      },
      reception: {
        summary: 'Positive 55%',
        good: ['Good in P1'],
        bad: ['Struggles in P4'],
        receivers: dummyTable,
        firstBall: dummyTable,
        positiveReception: dummyTable,
        serveTargets: ['In P1 serve on #7'],
        targets: [],
        formations: [],
        formationSystem: '3-receiver system',
        notes: '',
      },
      serveTargets: { recommendations: [], formations: [], notes: '' },
      attackers: [{
        player: { key: 'p12', jersey: '12', name: 'Piani' },
        courtSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="270" height="340"><rect width="270" height="340" fill="#fff"/><circle cx="135" cy="170" r="14" fill="#dc2626"/><text x="135" y="174">12</text></svg>',
        courtSample: '2 matches · 20 attacks',
        highlights: dummyTable,
        performance: dummyTable,
        distribution: dummyTable,
        notes: 'Primary opposite',
      }],
      setter: { groups: [], legend: 'Setter legend', notes: '' },
      serve: { servers: [], notes: '' },
      minSample: 5,
    };
    const t = (key: string) => key;
    const draft = createTacticalReportDraft(report, view, 'League', 123);
    expect(draft.boardPieceIds).not.toContain(PIECE_OVERVIEW_ROTATIONS);
    expect(draft.boardPieceIds).not.toContain('reception:formations');
    expect(draft.boardPieceIds).toContain('reception:serve-targets');
    expect(draft.draftCreatedAt).toBe(123);
    const { draftStatus: _status, ...legacy } = report;
    expect(createTacticalReportDraft(legacy, view, 'League', 123).boardPieceIds).toBeUndefined();
    expect(createTacticalReportDraft(legacy, view, 'League', 123).sheets).toEqual(report.sheets);
    const edited = updateBoardPieceEdit(draft, PIECE_KEYS_MAIN, () => ({ items: ['Manual advice'] }));
    expect(createTacticalReportDraft(edited, view, 'Other league', 456).pieceEdits?.[PIECE_KEYS_MAIN].items).toEqual(['Manual advice']);
    expect(createTacticalReportDraft(edited, view, 'Other league', 456).draftCreatedAt).toBe(123);


    // Include attacker piece on board and move it to the top
    report = toggleBoardPiece(report, view, 'attacker:p12');
    let pieces = resolveBoardPieces(report, view, t);
    expect(pieces.some((p) => p.id === 'attacker:p12')).toBe(true);

    report = moveBoardPiece(report, view, PIECE_OVERVIEW_ROTATIONS, -1);
    pieces = resolveBoardPieces(report, view, t);
    expect(pieces[0].id).toBe(PIECE_OVERVIEW_ROTATIONS);

    // Edit title and table cell of overview:rotations
    report = updateBoardPieceEdit(report, PIECE_OVERVIEW_ROTATIONS, (prev) => ({
      ...prev,
      title: 'Custom Rotations Title',
      table: {
        columns: ['Rotation', 'Side-Out'],
        rows: [['P1 (custom)', '65%']],
      },
    }));
    pieces = resolveBoardPieces(report, view, t);
    expect(pieces[0].title).toBe('Custom Rotations Title');
    expect(pieces[0].table?.columns).toEqual(['Rotation', 'Side-Out']);
    expect(pieces[0].table?.rows[0][0].text).toBe('P1 (custom)');
    expect(pieces[0].isModified).toBe(true);
    const duplicated = duplicateBoardPiece(report, view, PIECE_OVERVIEW_ROTATIONS, 'copy-rotations');
    const independent = updateBoardPieceEdit(duplicated, 'copy-rotations', (edit) => ({ ...edit, title: 'Independent title' }));
    const independentPieces = resolveBoardPieces(independent, view, t);
    expect(independentPieces[1].id).toBe('copy-rotations');
    expect(independentPieces[1].title).toBe('Independent title');
    expect(independentPieces[0].title).toBe('Custom Rotations Title');
    expect(independentPieces[1].table?.rows[0][0].text).toBe('P1 (custom)');
    const changedSource = updateBoardPieceEdit(independent, PIECE_OVERVIEW_ROTATIONS, () => ({ title: 'Changed source', table: { rows: [['Changed row']] } }));
    const retainedCopy = resolveBoardPieces(changedSource, view, t).find((piece) => piece.id === 'copy-rotations');
    expect(retainedCopy?.title).toBe('Independent title');
    expect(retainedCopy?.table?.rows[0][0].text).toBe('P1 (custom)');

    // Edit SVG court of attacker:p12
    const attackerPiece = pieces.find((p) => p.id === 'attacker:p12')!;
    const editableCourt = openPieceCourtForEditing(attackerPiece, 'main')!;
    expect(editableCourt.shapes.some((s) => s.kind === 'player' && s.number === '12')).toBe(true);

    // Reset edits on overview:rotations
    report = resetBoardPieceEdit(report, PIECE_OVERVIEW_ROTATIONS);
    pieces = resolveBoardPieces(report, view, t);
    expect(pieces[0].isModified).toBe(false);
    expect(pieces[0].table?.rows[0][0].text).toBe('P1');
    expect(pieces.some((p) => p.id === PIECE_KEYS_MAIN)).toBe(true);
  });
});

describe('target areas and resilient drawing history', () => {
  it('moves, resizes and serializes an editable target area independently of the source', () => {
    const original = createTacticalDrawing({ id: 'target', shapes: [{ id: 'area', kind: 'area', x: 20, y: 30, rx: 12, ry: 8 }] });
    const moved = moveDrawingShape(original, 'area', { x: 60, y: -4 });
    const resized = updateDrawingShape(moved, 'area', (shape) => ({ ...shape, rx: 20 }));
    expect(original.shapes[0]).toMatchObject({ x: 20, y: 30, rx: 12 });
    expect(deserializeTacticalDrawings(serializeTacticalDrawings([resized]))[0].shapes[0]).toMatchObject({ kind: 'area', x: 60, y: 0, rx: 20, ry: 8 });
    expect(buildTacticalBoardSvg(resized)).toContain('data-shape-kind="area"');
  });
  it('extracts generated target areas as editable shapes', () => {
    const drawing = extractEditableDrawingFromSvg('<svg width="200" height="200"><rect width="200" height="200"/><ellipse cx="100" cy="80" rx="20" ry="10"/></svg>', 'area');
    expect(drawing.shapes[0]).toMatchObject({ kind: 'area', x: 50, y: 40, rx: 10, ry: 5 });
    expect(drawing.backgroundSvg).not.toContain('ellipse');
  });
  it('clears redo after a new edit and retains the initial snapshot independently', () => {
    const drawing = createTacticalDrawing({ id: 'd', shapes: [{ id: 'p', kind: 'player', team: 'own', number: '', x: 20, y: 30 }] });
    let history = pushDrawingHistory(createDrawingHistory(drawing.shapes), moveDrawingShape(drawing, 'p', { x: 60, y: 70 }).shapes);
    history = undoDrawingHistory(history);
    history = pushDrawingHistory(history, []);
    expect(history.future).toEqual([]);
    expect(redoDrawingHistory(history)).toBe(history);
    expect(drawing.shapes[0]).toMatchObject({ x: 20, y: 30 });
  });
});


describe('drawing editor operations', () => {
  it('duplicates vector styling independently and rejects colliding identifiers', () => {
    const drawing = addDrawingShape(createTacticalDrawing({ id: 'board' }), { id: 'area', kind: 'area', x: 30, y: 40, rx: 12, ry: 8, color: '#ff00ff', opacity: .6 });
    const copy = duplicateDrawingShape(drawing, 'area', 'copy');
    expect(copy.shapes[1]).toEqual({ ...drawing.shapes[0], id: 'copy', x: 35, y: 45 });
    expect(drawing.shapes).toHaveLength(1);
    expect(duplicateDrawingShape(copy, 'area', 'copy')).toBe(copy);
    expect(duplicateDrawingShape(copy, 'missing', 'other')).toBe(copy);
    expect(deserializeTacticalDrawings(serializeTacticalDrawings([copy]))[0].shapes).toEqual(copy.shapes);
    const svg = buildTacticalBoardSvg(copy);
    expect(svg).toContain('fill="#ff00ff" fill-opacity="0.6"');
    expect(extractEditableDrawingFromSvg(svg, 'imported').shapes.filter((shape) => shape.kind === 'area').every((shape) => shape.color === '#ff00ff' && shape.opacity === .6)).toBe(true);
  });
  it('curves arrows and resets them without moving their endpoints', () => {
    const drawing = addDrawingShape(createTacticalDrawing({ id: 'board' }), { id: 'arrow', kind: 'arrow', team: 'own', x1: 20, y1: 50, x2: 80, y2: 50 });
    const curved = curveDrawingArrow(drawing, 'arrow', 20);
    const arrow = curved.shapes[0];
    if (arrow.kind !== 'arrow') throw new Error('Expected arrow');
    expect(drawingArrowBend(arrow)).toBe(20);
    expect(arrow).toMatchObject({ x1: 20, y1: 50, x2: 80, y2: 50, cx: 50, cy: 70 });
    expect(curveDrawingArrow(curved, 'arrow', 0).shapes).toEqual(drawing.shapes);
  });
  it('keeps number labels readable on light and dark fills', () => {
    expect(drawingTextContrast('#ffffff')).toBe('#111827');
    expect(drawingTextContrast('#000000')).toBe('#ffffff');
  });
});

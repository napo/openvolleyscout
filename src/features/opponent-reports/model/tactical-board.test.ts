import { describe, expect, it } from 'vitest';
import { createOpponentReport } from '@src/domain/opponent-report/types';
import {
  moveBoardPiece,
  openPieceCourtForEditing,
  PIECE_KEYS_MAIN,
  PIECE_OVERVIEW_ROTATIONS,
  resetBoardPieceEdit,
  resolveBoardPieces,
  toggleBoardPiece,
  updateBoardPieceEdit,
} from './board-pieces';
import { buildAttackerCourtSvg, type ReportView } from './report-view';
import {
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

import { describe, expect, it } from 'vitest';
import {
  addDrawingShape,
  addTacticalDrawing,
  buildTacticalBoardSvg,
  createDrawingHistory,
  createTacticalDrawing,
  deserializeTacticalDrawings,
  duplicateTacticalDrawing,
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
});

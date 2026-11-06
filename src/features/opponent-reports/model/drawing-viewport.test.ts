import { describe, expect, it } from 'vitest';
import { clampDrawingZoom, clientPointToDrawingCourt, drawingViewport } from './drawing-viewport';
import { createTacticalDrawing, getTacticalBoardDimensionsForDrawing } from './tactical-board';

describe('drawing viewport', () => {
  it('bounds zoom and panning inside the full document', () => {
    expect(clampDrawingZoom(NaN)).toBe(1);
    expect(clampDrawingZoom(9)).toBe(4);
    expect(drawingViewport(400, 600, 2, { x: 1000, y: -1000 })).toEqual({ x: 200, y: 0, width: 200, height: 300 });
    expect(drawingViewport(400, 600, 1, { x: 100, y: 100 })).toEqual({ x: 0, y: 0, width: 400, height: 600 });
  });
  it('maps touch and mouse positions through a zoomed view without changing the drawing', () => {
    const drawing = createTacticalDrawing({ id: 'board' });
    const before = JSON.stringify(drawing);
    const dims = getTacticalBoardDimensionsForDrawing(drawing);
    const viewport = drawingViewport(dims.width, dims.height, 2);
    const rect = { left: 10, top: 20, width: dims.width, height: dims.height };
    expect(clientPointToDrawingCourt({ x: 10 + rect.width / 2, y: 20 + rect.height / 2 }, rect, viewport, dims)).toEqual({ x: 50, y: 50 });
    const shifted = clientPointToDrawingCourt({ x: 10 + rect.width * .75, y: 20 + rect.height / 2 }, rect, viewport, dims);
    expect(shifted.x).toBeGreaterThan(50);
    expect(shifted.x).toBeLessThan(75);
    expect(JSON.stringify(drawing)).toBe(before);
    expect(clientPointToDrawingCourt({ x: 0, y: 0 }, { ...rect, width: 0 }, viewport, dims)).toEqual({ x: 50, y: 50 });
  });
});

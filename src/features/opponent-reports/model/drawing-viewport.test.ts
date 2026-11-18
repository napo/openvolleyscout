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
  it('maps pointer positions accurately when the editor canvas is rotated', () => {
    const drawing = createTacticalDrawing({ id: 'board' });
    const dims = getTacticalBoardDimensionsForDrawing(drawing);
    const viewport = drawingViewport(dims.height, dims.width, 1);
    const rect = { left: 0, top: 0, width: dims.height, height: dims.width };
    // Right side of 90°-rotated canvas corresponds to top of unrotated court (y < 50).
    const mapped = clientPointToDrawingCourt({ x: dims.height * 0.85, y: dims.width / 2 }, rect, viewport, dims, 90);
    expect(mapped.x).toBeCloseTo(50, 0);
    expect(mapped.y).toBeLessThan(20);
  });
});

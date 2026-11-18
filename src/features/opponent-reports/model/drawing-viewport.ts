import type { ChartRotation } from '@src/lib/utils/chart-rotation';
import { clampCourtCoord, type TacticalBoardDimensions } from './tactical-board';

export interface DrawingViewport { x: number; y: number; width: number; height: number }
export const clampDrawingZoom = (zoom: number): number => Number.isFinite(zoom) ? Math.min(4, Math.max(1, zoom)) : 1;

/** Zoom and pan are editor-only; saved coordinates always remain court percentages. */
export function drawingViewport(width: number, height: number, zoom: number, pan = { x: 0, y: 0 }): DrawingViewport {
  const scale = clampDrawingZoom(zoom);
  const w = width / scale;
  const h = height / scale;
  return { x: Math.min(width - w, Math.max(0, (width - w) / 2 + pan.x)), y: Math.min(height - h, Math.max(0, (height - h) / 2 + pan.y)), width: w, height: h };
}

export function clientPointToDrawingCourt(
  client: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  viewport: DrawingViewport,
  dims: TacticalBoardDimensions,
  rotation?: ChartRotation,
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
  const vx = viewport.x + ((client.x - rect.left) / rect.width) * viewport.width;
  const vy = viewport.y + ((client.y - rect.top) / rect.height) * viewport.height;
  let ux = vx;
  let uy = vy;
  if (rotation === 90) {
    ux = vy;
    uy = dims.height - vx;
  } else if (rotation === 180) {
    ux = dims.width - vx;
    uy = dims.height - vy;
  } else if (rotation === 270) {
    ux = dims.width - vy;
    uy = vx;
  }
  return {
    x: clampCourtCoord(((ux - dims.courtLeft) / dims.courtWidth) * 100),
    y: clampCourtCoord(((uy - dims.courtTop) / dims.courtHeight) * 100),
  };
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rotating a whole court chart by quarter turns while every label stays
 * upright: the drawing turns, each text turns back around its own anchor.
 * One helper for SVG markup (tactical reports) and one for canvas drawings
 * (data study heatmaps).
 */

export type ChartRotation = 0 | 90 | 180 | 270;

/** Next quarter turn clockwise. */
export function nextChartRotation(rotation: ChartRotation | undefined): ChartRotation {
  return (((rotation ?? 0) + 90) % 360) as ChartRotation;
}

export function isChartRotation(value: unknown): value is ChartRotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

const num = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const attr = (tag: string, name: string): string | undefined =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

const setAttr = (tag: string, name: string, value: string): string =>
  attr(tag, name) !== undefined
    ? tag.replace(new RegExp(`(\\s${name}=")[^"]*(")`), `$1${value}$2`)
    : tag.replace(/^<svg/, `<svg ${name}="${value}"`);

/** The transform that turns a w×h drawing by `rotation` and keeps it at the origin. */
function contentTransform(rotation: ChartRotation, width: number, height: number): string {
  if (rotation === 90) return `translate(${height} 0) rotate(90)`;
  if (rotation === 180) return `translate(${width} ${height}) rotate(180)`;
  return `translate(0 ${width}) rotate(270)`;
}

/**
 * Rotates a standalone SVG (root <svg> with a viewBox or width/height) by a
 * quarter turn. Texts placed with x/y are turned back, so they read normally.
 */
export function rotateSvgMarkup(svg: string, rotation: ChartRotation | undefined): string {
  if (!rotation) return svg;
  const open = svg.match(/<svg\b[^>]*>/);
  const close = svg.lastIndexOf('</svg>');
  if (!open || open.index === undefined || close < 0) return svg;
  const rootTag = open[0];
  const viewBox = attr(rootTag, 'viewBox')?.trim().split(/[\s,]+/).map(Number);
  const [minX, minY, width, height] = viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite)
    ? viewBox
    : [0, 0, num(attr(rootTag, 'width')) ?? 0, num(attr(rootTag, 'height')) ?? 0];
  if (!width || !height) return svg;

  const quarter = rotation === 90 || rotation === 270;
  const nextWidth = quarter ? height : width;
  const nextHeight = quarter ? width : height;
  let nextRoot = setAttr(rootTag, 'viewBox', `0 0 ${nextWidth} ${nextHeight}`);
  const pixelWidth = attr(rootTag, 'width');
  const pixelHeight = attr(rootTag, 'height');
  if (quarter && pixelWidth !== undefined && pixelHeight !== undefined) {
    nextRoot = setAttr(setAttr(nextRoot, 'width', pixelHeight), 'height', pixelWidth);
  }

  const content = svg.slice(open.index + rootTag.length, close);
  // A label next to a marker turns back around the marker, so it keeps its
  // place below or beside it; any other label around its own middle.
  const markers = [...content.matchAll(/<circle\b[^>]*>/g)].map(([tag]) => ({
    x: num(attr(tag, 'cx')) ?? 0,
    y: num(attr(tag, 'cy')) ?? 0,
    r: num(attr(tag, 'r')) ?? 0,
  }));
  const body = content.replace(/<text\b[^>]*>([^<]*)/g, (whole, label: string) => {
    const tag = whole.slice(0, whole.length - label.length);
    const x = num(attr(tag, 'x')) ?? 0;
    const y = num(attr(tag, 'y')) ?? 0;
    const size = num(attr(tag, 'font-size')) ?? 10;
    const middleY = y - size * 0.35;
    // Estimated half width, to turn a start/end anchored label around its middle.
    const halfWidth = Array.from(label.trim()).length * size * 0.3;
    const anchor = attr(tag, 'text-anchor');
    const middleX = anchor === 'middle' ? x : anchor === 'end' ? x - halfWidth : x + halfWidth;
    let pivot = { x: middleX, y: middleY };
    let best = Infinity;
    for (const marker of markers) {
      const distance = Math.hypot(marker.x - x, marker.y - middleY);
      if (distance <= marker.r + size * 3.5 && distance < best) {
        best = distance;
        pivot = marker;
      }
    }
    const upright = `rotate(${-rotation} ${+pivot.x.toFixed(2)} ${+pivot.y.toFixed(2)})`;
    const existing = attr(tag, 'transform');
    const turned = existing !== undefined
      ? tag.replace(/(\stransform=")([^"]*)(")/, `$1${upright} $2$3`)
      : tag.replace(/^<text/, `<text transform="${upright}"`);
    return `${turned}${label}`;
  });
  const shift = minX || minY ? ` translate(${-minX} ${-minY})` : '';
  return `${svg.slice(0, open.index)}${nextRoot}<g transform="${contentTransform(rotation, width, height)}${shift}">${body}</g>${svg.slice(close)}`;
}

/**
 * Sizes a canvas for a w×h drawing turned by `rotation` and sets the context
 * so the drawing code can keep working in its own w×h coordinates. While the
 * returned function has not been called, fillText/strokeText draw upright.
 */
export function rotateCanvasDrawing(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rotation: ChartRotation | undefined,
): () => void {
  // Drop a patch left by an earlier drawing, so the texts never turn twice.
  const patched = ctx as unknown as Record<string, unknown>;
  delete patched.fillText;
  delete patched.strokeText;
  const quarter = rotation === 90 || rotation === 270;
  canvas.width = quarter ? height : width;
  canvas.height = quarter ? width : height;
  if (!rotation) return () => {};
  if (rotation === 90) ctx.setTransform(0, 1, -1, 0, height, 0);
  else if (rotation === 180) ctx.setTransform(-1, 0, 0, -1, width, height);
  else ctx.setTransform(0, -1, 1, 0, 0, width);

  const angle = (-rotation * Math.PI) / 180;
  const { fillText, strokeText } = ctx;
  const upright = (draw: typeof fillText) => function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
    this.save();
    this.translate(x, y);
    this.rotate(angle);
    if (maxWidth === undefined) draw.call(this, text, 0, 0);
    else draw.call(this, text, 0, 0, maxWidth);
    this.restore();
  };
  ctx.fillText = upright(fillText);
  ctx.strokeText = upright(strokeText);
  return () => {
    delete patched.fillText;
    delete patched.strokeText;
  };
}

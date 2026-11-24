// SPDX-License-Identifier: AGPL-3.0-or-later

/** A text label to place: centred on `x` (text-anchor middle), baseline at `y`. */
export interface SvgLabel {
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface SvgBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Approximate box of a bold label: about 0.62 em per character. */
export function svgLabelBox(label: SvgLabel, padding = 1.5): SvgBox {
  const halfWidth = (label.text.length * label.fontSize * 0.62) / 2;
  return {
    left: label.x - halfWidth - padding,
    right: label.x + halfWidth + padding,
    top: label.y - label.fontSize * 0.85 - padding,
    bottom: label.y + label.fontSize * 0.2 + padding,
  };
}

function overlaps(a: SvgBox, b: SvgBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function inside(box: SvgBox, bounds: SvgBox): boolean {
  return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
}

/**
 * Moves labels so that none overlaps another or a fixed obstacle: each label,
 * in order, takes the nearest free spot around where it was asked to be, kept
 * within `bounds`. A label with no free spot stays where it was asked.
 */
export function placeSvgLabels<L extends SvgLabel>(
  labels: readonly L[],
  bounds: SvgBox,
  obstacles: readonly SvgBox[] = [],
): L[] {
  const taken: SvgBox[] = [...obstacles];
  const offsets: Array<[number, number]> = [[0, 0]];
  for (let ring = 1; ring <= 8; ring += 1) {
    const dy = ring * 6;
    const dx = ring * 10;
    offsets.push([0, -dy], [0, dy], [-dx, 0], [dx, 0], [-dx, -dy], [dx, -dy], [-dx, dy], [dx, dy]);
  }
  return labels.map((label) => {
    for (const [dx, dy] of offsets) {
      const moved = { ...label, x: label.x + dx, y: label.y + dy };
      const box = svgLabelBox(moved);
      if (!inside(box, bounds)) continue;
      if (taken.some((other) => overlaps(box, other))) continue;
      taken.push(box);
      return moved;
    }
    taken.push(svgLabelBox(label));
    return label;
  });
}
